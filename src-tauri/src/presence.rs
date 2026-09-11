use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

pub const APP_ID: &str = "1546880430970638359";
pub const LARGE_IMAGE: &str = "cascade";
pub const LARGE_TEXT: &str = "Cascade";
pub const MINIMAL_DETAILS: &str = "Using Cascade";
pub const MAX_FIELD: usize = 128;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Off,
    Minimal,
    Detailed,
}

pub fn parse_mode(raw: &str) -> Mode {
    match raw {
        "detailed" => Mode::Detailed,
        "minimal" => Mode::Minimal,
        _ => Mode::Off,
    }
}

fn trim_field(value: Option<&str>) -> Option<String> {
    let text = value?.trim();
    if text.is_empty() {
        return None;
    }
    let mut out: String = text.chars().take(MAX_FIELD).collect();
    while out.chars().count() < 2 {
        out.push(' ');
    }
    Some(out)
}

pub fn fields(
    mode: Mode,
    details: Option<&str>,
    state: Option<&str>,
) -> (Option<String>, Option<String>) {
    match mode {
        Mode::Off => (None, None),
        Mode::Minimal => (Some(MINIMAL_DETAILS.to_string()), None),
        Mode::Detailed => (trim_field(details), trim_field(state)),
    }
}

type Fields = (Option<String>, Option<String>);

/// One presence the frontend asked for.
struct Update {
    mode: Mode,
    fields: Fields,
}

/// Hands presence updates to a thread of their own. Discord's IPC blocks until
/// Discord answers (its handshake waits for a reply with no timeout), and Tauri
/// runs plain commands on the main thread, so talking to Discord inline froze
/// the whole window whenever Discord was slow or wedged at startup. Now the
/// command only passes the newest request along; a stuck Discord can at worst
/// hold up the presence itself.
#[derive(Default)]
pub struct Presence {
    sender: Mutex<Option<Sender<Update>>>,
}

impl Presence {
    pub fn submit(
        &self,
        mode: Mode,
        details: Option<&str>,
        state: Option<&str>,
    ) -> Result<(), String> {
        if APP_ID.is_empty() {
            return Ok(());
        }
        let update = Update {
            mode,
            fields: fields(mode, details, state),
        };
        let mut sender = self.sender.lock().map_err(|_| "presence is busy")?;
        if sender.is_none() {
            let (tx, rx) = mpsc::channel();
            std::thread::Builder::new()
                .name("discord-presence".into())
                .spawn(move || Worker::default().run(rx))
                .map_err(|err| err.to_string())?;
            *sender = Some(tx);
        }
        if let Some(tx) = sender.as_ref() {
            if tx.send(update).is_err() {
                // The worker has gone away; the next update starts a new one.
                *sender = None;
            }
        }
        Ok(())
    }
}

/// Owns the Discord connection on the presence thread.
struct Worker {
    client: Option<DiscordIpcClient>,
    last: Option<Fields>,
    started: i64,
}

impl Default for Worker {
    fn default() -> Self {
        Self {
            client: None,
            last: None,
            started: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_secs() as i64)
                .unwrap_or(0),
        }
    }
}

impl Worker {
    fn run(mut self, updates: Receiver<Update>) {
        while let Ok(mut update) = updates.recv() {
            // While Discord was slow, only the newest request still matters.
            while let Ok(newer) = updates.try_recv() {
                update = newer;
            }
            self.apply(update);
        }
        self.disconnect();
    }

    fn apply(&mut self, update: Update) {
        let Update { mode, fields: next } = update;
        if self.last.as_ref() == Some(&next) {
            return;
        }

        if mode == Mode::Off {
            self.disconnect();
            self.last = Some(next);
            return;
        }

        if self.client.is_none() {
            let mut fresh = DiscordIpcClient::new(APP_ID);
            if fresh.connect().is_err() {
                self.last = None;
                return;
            }
            self.client = Some(fresh);
        }

        let Some(active) = self.client.as_mut() else {
            return;
        };

        let assets = activity::Assets::new()
            .large_image(LARGE_IMAGE)
            .large_text(LARGE_TEXT);
        let timestamps = activity::Timestamps::new().start(self.started);
        let mut payload = activity::Activity::new()
            .assets(assets)
            .timestamps(timestamps);
        if let Some(details) = next.0.as_deref() {
            payload = payload.details(details);
        }
        if let Some(state) = next.1.as_deref() {
            payload = payload.state(state);
        }

        if active.set_activity(payload).is_err() {
            let _ = active.close();
            self.client = None;
            self.last = None;
            return;
        }

        self.last = Some(next);
    }

    fn disconnect(&mut self) {
        if let Some(mut active) = self.client.take() {
            let _ = active.clear_activity();
            let _ = active.close();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_three_modes_and_defaults_to_off() {
        assert_eq!(parse_mode("detailed"), Mode::Detailed);
        assert_eq!(parse_mode("minimal"), Mode::Minimal);
        assert_eq!(parse_mode("off"), Mode::Off);
        assert_eq!(parse_mode("nonsense"), Mode::Off);
        assert_eq!(parse_mode(""), Mode::Off);
    }

    #[test]
    fn minimal_never_leaks_what_the_map_is() {
        let (details, state) = fields(
            Mode::Minimal,
            Some("Camellia - Ghost"),
            Some("Playtesting [Insane] 7K"),
        );
        assert_eq!(details, Some("Using Cascade".to_string()));
        assert_eq!(state, None);
    }

    #[test]
    fn off_publishes_nothing_at_all() {
        let (details, state) = fields(Mode::Off, Some("Camellia - Ghost"), Some("Editing"));
        assert_eq!(details, None);
        assert_eq!(state, None);
    }

    #[test]
    fn detailed_passes_the_map_through() {
        let (details, state) = fields(
            Mode::Detailed,
            Some("Camellia - Ghost"),
            Some("Editing [Insane] 7K"),
        );
        assert_eq!(details, Some("Camellia - Ghost".to_string()));
        assert_eq!(state, Some("Editing [Insane] 7K".to_string()));
    }

    #[test]
    fn drops_blank_fields_and_caps_long_ones() {
        assert_eq!(fields(Mode::Detailed, Some("   "), None).0, None);
        assert_eq!(fields(Mode::Detailed, None, None), (None, None));

        let long = "x".repeat(400);
        let (details, _) = fields(Mode::Detailed, Some(&long), None);
        assert_eq!(details.unwrap().chars().count(), MAX_FIELD);
    }

    #[test]
    fn pads_fields_discord_would_reject_as_too_short() {
        let (details, _) = fields(Mode::Detailed, Some("a"), None);
        assert_eq!(details.unwrap().chars().count(), 2);
    }

    #[test]
    fn submitting_returns_straight_away() {
        // Off never touches Discord, so this runs anywhere; the point is that
        // the call hands over and returns rather than doing the work inline.
        let presence = Presence::default();
        assert_eq!(presence.submit(Mode::Off, None, None), Ok(()));
        assert_eq!(presence.submit(Mode::Off, None, None), Ok(()));
    }
}
