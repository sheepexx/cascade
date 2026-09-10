use std::io::{Read, Seek};

#[derive(Clone, Copy)]
pub struct ArchiveLimits {
    pub max_compressed_bytes: u64,
    pub max_entries: usize,
    pub max_entry_bytes: u64,
    pub max_expanded_bytes: u64,
    pub max_compression_ratio: u64,
}

pub const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = ArchiveLimits {
    max_compressed_bytes: 512 * 1024 * 1024,
    max_entries: 4096,
    max_entry_bytes: 512 * 1024 * 1024,
    max_expanded_bytes: 1024 * 1024 * 1024,
    max_compression_ratio: 200,
};

pub fn validate_zip<R: Read + Seek>(
    zip: &mut zip::ZipArchive<R>,
    compressed_bytes: u64,
    limits: ArchiveLimits,
) -> Result<(), String> {
    if compressed_bytes > limits.max_compressed_bytes {
        return Err("Archive exceeds the compressed size limit.".to_string());
    }
    if zip.len() > limits.max_entries {
        return Err("Archive contains too many entries.".to_string());
    }

    let mut expanded_bytes = 0_u64;
    for index in 0..zip.len() {
        let entry = zip
            .by_index(index)
            .map_err(|err| format!("Cannot inspect the archive: {err}"))?;
        if entry.is_dir() {
            continue;
        }
        let expanded = entry.size();
        let compressed = entry.compressed_size();
        if expanded > limits.max_entry_bytes {
            return Err("Archive entry exceeds the expanded size limit.".to_string());
        }
        if expanded > compressed.max(1).saturating_mul(limits.max_compression_ratio) {
            return Err("Archive entry exceeds the compression ratio limit.".to_string());
        }
        expanded_bytes = expanded_bytes
            .checked_add(expanded)
            .ok_or_else(|| "Archive expanded size overflowed.".to_string())?;
        if expanded_bytes > limits.max_expanded_bytes {
            return Err("Archive exceeds the total expanded size limit.".to_string());
        }
    }
    if expanded_bytes
        > compressed_bytes
            .max(1)
            .saturating_mul(limits.max_compression_ratio)
    {
        return Err("Archive exceeds the compression ratio limit.".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;

    fn archive(files: &[(&str, &[u8])], deflate: bool) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let method = if deflate {
            zip::CompressionMethod::Deflated
        } else {
            zip::CompressionMethod::Stored
        };
        for (name, bytes) in files {
            writer
                .start_file(*name, SimpleFileOptions::default().compression_method(method))
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn limits(compressed: u64) -> ArchiveLimits {
        ArchiveLimits {
            max_compressed_bytes: compressed,
            max_entries: 10,
            max_entry_bytes: 100,
            max_expanded_bytes: 100,
            max_compression_ratio: 1000,
        }
    }

    #[test]
    fn accepts_boundaries_and_rejects_the_next_byte() {
        let bytes = archive(&[("map.osu", b"1234")], false);
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes.as_slice())).unwrap();
        validate_zip(&mut zip, bytes.len() as u64, limits(bytes.len() as u64)).unwrap();

        let mut zip = zip::ZipArchive::new(Cursor::new(bytes.as_slice())).unwrap();
        let mut too_small = limits(bytes.len() as u64);
        too_small.max_entry_bytes = 3;
        assert!(validate_zip(&mut zip, bytes.len() as u64, too_small)
            .unwrap_err()
            .contains("entry exceeds"));
    }

    #[test]
    fn rejects_too_many_entries_and_total_expansion() {
        let bytes = archive(&[("one", b"1234"), ("two", b"5678")], false);
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes.as_slice())).unwrap();
        let mut one_entry = limits(bytes.len() as u64);
        one_entry.max_entries = 1;
        assert!(validate_zip(&mut zip, bytes.len() as u64, one_entry)
            .unwrap_err()
            .contains("too many entries"));

        let mut zip = zip::ZipArchive::new(Cursor::new(bytes.as_slice())).unwrap();
        let mut seven_bytes = limits(bytes.len() as u64);
        seven_bytes.max_expanded_bytes = 7;
        assert!(validate_zip(&mut zip, bytes.len() as u64, seven_bytes)
            .unwrap_err()
            .contains("total expanded"));
    }

    #[test]
    fn rejects_extreme_compression_ratios() {
        let zeros = vec![0_u8; 50_000];
        let bytes = archive(&[("zeros", zeros.as_slice())], true);
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes.as_slice())).unwrap();
        let mut strict = limits(bytes.len() as u64);
        strict.max_entry_bytes = 100_000;
        strict.max_expanded_bytes = 100_000;
        strict.max_compression_ratio = 10;
        assert!(validate_zip(&mut zip, bytes.len() as u64, strict)
            .unwrap_err()
            .contains("compression ratio"));
    }
}
