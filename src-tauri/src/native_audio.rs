//! WASAPI lives entirely on one MTA thread. The WebView sends transport commands
//! and PCM, never audio callbacks. Closing a session joins the thread and releases
//! the exclusive endpoint before another session can open it.
use serde::{Deserialize, Serialize};
use std::sync::{mpsc, Arc, Mutex};
use tauri::ipc::{InvokeBody, Request};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    session: u32,
    revision: u32,
    position_ms: f64,
    playing: bool,
    latency_ms: f64,
    device: String,
    error: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Control {
    revision: u32,
    action: String,
    position_ms: Option<f64>,
    rate: Option<f64>,
    volume: Option<f64>,
    start_ms: Option<f64>,
    end_ms: Option<f64>,
    fade_in_ms: Option<f64>,
    fade_out_ms: Option<f64>,
    looping: Option<bool>,
}

struct Pcm { samples: Vec<f32>, sample_rate: u32 }
impl Pcm {
    fn frames(&self) -> usize { self.samples.len() / 2 }
    fn sample(&self, position: f64, channel: usize) -> f64 {
        let index = position.max(0.0) as usize;
        let fraction = position - index as f64;
        let a = self.samples.get(index * 2 + channel).copied().unwrap_or(0.0) as f64;
        let b = self.samples.get((index + 1) * 2 + channel).copied().unwrap_or(0.0) as f64;
        a + (b - a) * fraction
    }
}

enum Command { Control(Control), Effect(Arc<Pcm>, f64), Close }
struct Session { id: u32, tx: mpsc::SyncSender<Command>, status: Arc<Mutex<Status>>, thread: std::thread::JoinHandle<()> }
#[derive(Default)]
pub struct NativeAudio { inner: Arc<Mutex<Option<Session>>> }
impl Drop for NativeAudio {
    fn drop(&mut self) { if let Ok(mut state) = self.inner.lock() { stop(&mut state); } }
}
fn stop(state: &mut Option<Session>) {
    if let Some(session) = state.take() {
        let _ = session.tx.send(Command::Close);
        let _ = session.thread.join();
    }
}

fn decode(request: &Request<'_>) -> Result<(u32, Arc<Pcm>, f64), String> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err("Expected binary PCM.".into()); };
    if bytes.len() < 16 || bytes.len() > 256 * 1024 * 1024 { return Err("Audio payload is outside supported limits (256 MiB).".into()); }
    let word = |i: usize| u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap());
    let session = word(0); let sample_rate = word(4); let frames = word(8) as usize;
    let volume = f32::from_bits(word(12)) as f64;
    if !(8000..=192000).contains(&sample_rate) || frames == 0 || frames.checked_mul(8).and_then(|v| v.checked_add(16)) != Some(bytes.len()) {
        return Err("Invalid PCM header.".into());
    }
    let samples = bytes[16..].chunks_exact(4).map(|b| {
        let value = f32::from_le_bytes(b.try_into().unwrap());
        if value.is_finite() { value.clamp(-1.0, 1.0) } else { 0.0 }
    }).collect();
    Ok((session, Arc::new(Pcm { samples, sample_rate }), if volume.is_finite() { volume.clamp(0.0, 1.0) } else { 0.0 }))
}

#[tauri::command]
pub async fn native_audio_load(state: tauri::State<'_, NativeAudio>, request: Request<'_>) -> Result<Status, String> {
    let (id, pcm, _) = decode(&request)?;
    let inner = state.inner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = inner.lock().map_err(|_| "Audio lock failed")?;
        stop(&mut state);
        let (tx, rx) = mpsc::sync_channel(128);
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let status = Arc::new(Mutex::new(Status { session: id, ..Status::default() }));
        let worker_status = status.clone();
        let thread = std::thread::spawn(move || {
            let result = run(pcm, rx, &worker_status, &ready_tx);
            if let Err(error) = result {
                if let Ok(mut s) = worker_status.lock() { s.playing = false; s.error = Some(error.clone()); }
                let _ = ready_tx.try_send(Err(error));
            }
        });
        match ready_rx.recv_timeout(std::time::Duration::from_secs(8)) {
            Ok(Ok(())) => {
                let initial = status.lock().map_err(|_| "Audio status lock failed")?.clone();
                *state = Some(Session { id, tx, status, thread }); Ok(initial)
            }
            result => {
                let _ = tx.send(Command::Close); let _ = thread.join();
                Err(match result { Ok(Err(e)) => e, _ => "Audio device did not respond.".into() })
            }
        }
    }).await.map_err(|e| e.to_string())?
}

// Control, status and effect run off the main thread. They share a lock with
// load and close, which hold it while the device opens, so a call waiting there
// on the main thread froze the window.
#[tauri::command(async)]
pub fn native_audio_control(state: tauri::State<'_, NativeAudio>, session: u32, control: Control) -> Result<(), String> {
    if [&control.position_ms, &control.rate, &control.volume, &control.start_ms, &control.end_ms, &control.fade_in_ms, &control.fade_out_ms].iter().any(|v| v.is_some_and(|n| !n.is_finite())) {
        return Err("Invalid transport value.".into());
    }
    if !["play", "pause", "seek", "configure"].contains(&control.action.as_str()) { return Err("Unknown transport action.".into()); }
    let state = state.inner.lock().map_err(|_| "Audio lock failed")?;
    let s = state.as_ref().filter(|s| s.id == session).ok_or("Audio session closed")?;
    s.tx.try_send(Command::Control(control)).map_err(|_| "Audio device is not responding.".into())
}

#[tauri::command(async)]
pub fn native_audio_status(state: tauri::State<'_, NativeAudio>, session: u32) -> Result<Status, String> {
    let state = state.inner.lock().map_err(|_| "Audio lock failed")?;
    let s = state.as_ref().filter(|s| s.id == session).ok_or("Audio session closed")?;
    let result = s.status.lock().map_err(|_| "Audio status lock failed")?.clone(); Ok(result)
}

#[tauri::command]
pub async fn native_audio_close(state: tauri::State<'_, NativeAudio>, session: u32) -> Result<(), String> {
    let inner = state.inner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = inner.lock().map_err(|_| "Audio lock failed")?;
        if state.as_ref().is_some_and(|s| s.id == session) { stop(&mut state); }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command(async)]
pub fn native_audio_effect(state: tauri::State<'_, NativeAudio>, request: Request<'_>) -> Result<(), String> {
    let (id, pcm, volume) = decode(&request)?;
    if pcm.frames() > pcm.sample_rate as usize * 10 { return Err("Effect is too long.".into()); }
    let state = state.inner.lock().map_err(|_| "Audio lock failed")?;
    let session = state.as_ref().filter(|s| s.id == id).ok_or("Audio session closed")?;
    session.tx.try_send(Command::Effect(pcm, volume)).map_err(|_| "Effect queue is full.".into())
}

struct Mixer {
    pcm: Arc<Pcm>, position: f64, playing: bool, rate: f64, volume: f64,
    start: f64, end: f64, fade_in: f64, fade_out: f64, looping: bool,
    effects: Vec<(Arc<Pcm>, f64, f64)>,
}
impl Mixer {
    fn new(pcm: Arc<Pcm>) -> Self {
        let end = pcm.frames() as f64;
        Self { pcm, position: 0.0, playing: false, rate: 1.0, volume: 0.04, start: 0.0, end, fade_in: 0.0, fade_out: 0.0, looping: false, effects: Vec::with_capacity(64) }
    }
    fn bounded(&self, position: f64) -> f64 {
        if self.looping && self.end > self.start && position >= self.end {
            self.start + (position - self.start).rem_euclid(self.end - self.start)
        } else { position.clamp(0.0, self.end) }
    }
    fn control(&mut self, c: &Control) {
        let sr = self.pcm.sample_rate as f64 / 1000.0;
        if let Some(rate) = c.rate { self.rate = rate.clamp(0.0625, 8.0); }
        if let Some(volume) = c.volume { self.volume = volume.clamp(0.0, 1.0); }
        if let Some(start) = c.start_ms { self.start = (start * sr).clamp(0.0, self.pcm.frames() as f64); }
        if let Some(end) = c.end_ms { self.end = (end * sr).clamp(self.start, self.pcm.frames() as f64); }
        if let Some(fade) = c.fade_in_ms { self.fade_in = fade.max(0.0) * sr; }
        if let Some(fade) = c.fade_out_ms { self.fade_out = fade.max(0.0) * sr; }
        if let Some(looping) = c.looping { self.looping = looping; }
        if let Some(position) = c.position_ms { self.position = (position * sr).clamp(0.0, self.pcm.frames() as f64); }
        if c.action == "play" {
            if self.position < self.start || self.position >= self.end { self.position = self.start; }
            self.playing = self.end > self.start;
        } else if c.action == "pause" { self.playing = false; }
    }
    fn frame(&mut self, output_rate: f64) -> [f64; 2] {
        let mut out = [0.0; 2];
        if self.playing {
            self.position = self.bounded(self.position);
            if self.position >= self.end { self.playing = false; }
            else {
                let fade_in = if self.fade_in > 0.0 { ((self.position - self.start) / self.fade_in).clamp(0.0, 1.0) } else { 1.0 };
                let fade_out = if self.fade_out > 0.0 { ((self.end - self.position) / self.fade_out).clamp(0.0, 1.0) } else { 1.0 };
                for (c, sample) in out.iter_mut().enumerate() { *sample = self.pcm.sample(self.position, c) * self.volume * fade_in * fade_out; }
                self.position += self.pcm.sample_rate as f64 / output_rate * self.rate;
            }
        }
        for (pcm, pos, volume) in &mut self.effects {
            for (c, sample) in out.iter_mut().enumerate() { *sample += pcm.sample(*pos, c) * *volume; }
            *pos += pcm.sample_rate as f64 / output_rate;
        }
        self.effects.retain(|(pcm, pos, _)| *pos < pcm.frames() as f64);
        out
    }
}

#[cfg(windows)]
fn run(pcm: Arc<Pcm>, rx: mpsc::Receiver<Command>, status: &Arc<Mutex<Status>>, ready: &mpsc::SyncSender<Result<(), String>>) -> Result<(), String> {
    use wasapi::*;
    initialize_mta().ok().map_err(|e| e.to_string())?;
    struct ComGuard;
    impl Drop for ComGuard { fn drop(&mut self) { deinitialize(); } }
    let _com = ComGuard;
    let execute = || -> Result<(), Box<dyn std::error::Error>> {
        let enumerator = DeviceEnumerator::new()?;
        let device = enumerator.get_default_device(&Direction::Render)?;
        let mut client = device.get_iaudioclient()?;
        let mut accepted = None;
        for rate in [48000, 44100, pcm.sample_rate as usize] {
            for bits in [32, 16] {
                let sample_type = if bits == 32 { SampleType::Float } else { SampleType::Int };
                let candidate = WaveFormat::new(bits, bits, &sample_type, rate, 2, None);
                if let Ok(format) = client.is_supported_exclusive_with_quirks(&candidate) { accepted = Some((format, bits)); break; }
            }
            if accepted.is_some() { break; }
        }
        let (format, bits) = accepted.ok_or("The default output does not support stereo exclusive audio.")?;
        let (_, minimum) = client.get_device_period()?;
        let period = client.calculate_aligned_period_near(minimum.max(50_000), Some(128), &format)?;
        if let Err(first_error) = client.initialize_client(&format, &Direction::Render, &StreamMode::EventsExclusive { period_hns: period }) {
            // Some HDA drivers return their required alignment only after Initialize.
            let frames = client.get_buffer_size().map_err(|_| first_error)?;
            client = device.get_iaudioclient()?;
            let aligned = calculate_period_100ns(frames as i64, format.get_samplespersec() as i64);
            client.initialize_client(&format, &Direction::Render, &StreamMode::EventsExclusive { period_hns: aligned })?;
        }
        let event = client.set_get_eventhandle()?;
        let renderer = client.get_audiorenderclient()?;
        let clock = client.get_audioclock()?;
        let frequency = clock.get_frequency()? as f64;
        let output_rate = format.get_samplespersec() as f64;
        let frame_count = client.get_buffer_size()? as usize;
        let mut bytes = vec![0u8; frame_count * format.get_blockalign() as usize];
        let mut mixer = Mixer::new(pcm);
        let mut submitted: u64 = 0;
        let mut packets: std::collections::VecDeque<(u64, f64, bool)> = std::collections::VecDeque::new();
        let mut revision = 0;
        {
            let mut s = status.lock().map_err(|_| "Audio status lock failed")?;
            s.latency_ms = frame_count as f64 / output_rate * 1000.0;
            s.device = device.get_friendlyname().unwrap_or_else(|_| "Default Windows output".into());
        }
        let _ = ready.send(Ok(()));
        let mut started = false;
        loop {
            let device_frame = if started { clock.get_position()?.0 as f64 / frequency * output_rate } else { 0.0 };
            while packets.len() > 1 && packets[1].0 as f64 <= device_frame { packets.pop_front(); }
            let (position, audible_playing) = if let Some((frame, source, playing)) = packets.front() {
                let pos = mixer.bounded(source + if *playing { (device_frame - *frame as f64).max(0.0) * mixer.pcm.sample_rate as f64 / output_rate * mixer.rate } else { 0.0 });
                (pos, *playing && (mixer.looping || pos < mixer.end))
            } else { (mixer.position, mixer.playing) };
            {
                let mut s = status.lock().map_err(|_| "Audio status lock failed")?;
                s.position_ms = position / mixer.pcm.sample_rate as f64 * 1000.0;
                s.playing = audible_playing; s.revision = revision;
            }
            let mut flush = false;
            loop {
                match rx.try_recv() {
                    Ok(Command::Close) | Err(mpsc::TryRecvError::Disconnected) => { if started { client.stop_stream()?; } return Ok(()); }
                    Ok(Command::Effect(pcm, gain)) => { if mixer.effects.len() < 64 { mixer.effects.push((pcm, 0.0, gain)); } }
                    Ok(Command::Control(c)) => {
                        let transport = c.action != "configure" || c.rate.is_some() || c.start_ms.is_some() || c.end_ms.is_some();
                        if transport && !flush { mixer.position = position; flush = true; }
                        mixer.control(&c); revision = c.revision;
                    }
                    Err(mpsc::TryRecvError::Empty) => break,
                }
            }
            if flush && started {
                client.stop_stream()?; client.reset_stream()?; started = false;
                submitted = 0; packets.clear();
            }
            packets.push_back((submitted, mixer.position, mixer.playing));
            for frame in bytes.chunks_exact_mut(format.get_blockalign() as usize) {
                let samples = mixer.frame(output_rate);
                for (c, sample) in frame.chunks_exact_mut(bits / 8).enumerate() {
                    let value = samples[c].clamp(-1.0, 1.0);
                    if bits == 32 { sample.copy_from_slice(&(value as f32).to_le_bytes()); }
                    else { sample.copy_from_slice(&((value * 32767.0) as i16).to_le_bytes()); }
                }
            }
            renderer.write_to_device(frame_count, &bytes, None)?;
            submitted += frame_count as u64;
            if !started { client.start_stream()?; started = true; }
            event.wait_for_event(1000)?;
        }
    };
    execute().map_err(|e| format!("WASAPI exclusive: {e}"))
}

#[cfg(not(windows))]
fn run(_pcm: Arc<Pcm>, _rx: mpsc::Receiver<Command>, _status: &Arc<Mutex<Status>>, _ready: &mpsc::SyncSender<Result<(), String>>) -> Result<(), String> {
    Err("WASAPI exclusive is available only on Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn mixer() -> Mixer { Mixer::new(Arc::new(Pcm { samples: vec![0.5; 200], sample_rate: 1000 })) }
    #[test]
    fn loops_and_resamples_without_leaving_region() {
        let mut m = mixer(); m.start = 10.0; m.end = 20.0; m.position = 19.0; m.rate = 2.0; m.looping = true; m.playing = true;
        m.frame(1000.0); m.frame(1000.0);
        assert_eq!(m.position, 13.0); assert!(m.playing);
    }
    #[test]
    fn ends_and_fades() {
        let mut m = mixer(); m.playing = true; m.fade_in = 20.0;
        assert_eq!(m.frame(1000.0), [0.0, 0.0]);
        m.position = 100.0; assert_eq!(m.frame(1000.0), [0.0, 0.0]); assert!(!m.playing);
    }
}
