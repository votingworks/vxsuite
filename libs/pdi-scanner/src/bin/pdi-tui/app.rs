use std::{
    sync::mpsc::{RecvTimeoutError, TryRecvError},
    time::Duration,
};

use ratatui::text::Line;

use pdi_scanner::{
    client::Client,
    protocol::{
        packets::Incoming,
        types::{ColorMode, EjectMotion, FeederMode, Resolution, ScanSideMode, Status},
    },
    scanner::Scanner,
};

use super::{
    config::{AutoScanConfig, WatchStatusConfig, EJECT_DELAY_STEP},
    log::LogEntry,
};

const MAX_LOG_LENGTH: usize = 500;

// App state
pub struct App<'a> {
    log: Vec<LogEntry<'a>>,
    client: Option<Client<Scanner>>,
    auto_scan: AutoScanConfig,
    auto_eject_delay: Duration,
    watch_status: WatchStatusConfig,
    should_connect: bool,
    should_disconnect: bool,
    should_quit: bool,
}

impl<'a> App<'a> {
    pub fn new() -> Self {
        Self {
            log: vec![],
            client: None,
            auto_scan: AutoScanConfig::default(),
            auto_eject_delay: Duration::default(),
            watch_status: WatchStatusConfig::default(),
            should_connect: false,
            should_disconnect: false,
            should_quit: false,
        }
    }

    pub fn connect(&mut self) {
        self.log("⏳ Connecting to scanner…");
        self.should_connect = true;
    }

    pub fn disconnect(&mut self) {
        self.log("⚡ Disconnecting from scanner…");
        self.should_disconnect = true;
    }

    pub fn set_should_quit(&mut self) {
        self.should_quit = true;
    }

    pub fn quit(&mut self) {
        if let Ok(client) = self.get_client_mut() {
            let _ = client.set_feeder_mode(FeederMode::Disabled);
        }
        self.disconnect_client();
    }

    pub fn log(&mut self, line: impl Into<Line<'a>>) {
        let log_entry = LogEntry::new(line);

        if let Some(last) = self.log.last_mut() {
            if last == log_entry {
                last.increment_count();
                return;
            }
        }

        self.log.push(log_entry);

        if self.log.len() > MAX_LOG_LENGTH {
            self.log.drain(0..self.log.len() - MAX_LOG_LENGTH);
        }
    }

    pub fn clear_log(&mut self) {
        self.log.clear();
    }

    pub fn log_entries(&self, count: usize) -> &[LogEntry<'a>] {
        &self.log[self.log.len().saturating_sub(count)..]
    }

    pub fn connection_state(&self) -> ConnectionState {
        if self.should_connect {
            ConnectionState::Connecting
        } else if self.client.is_none() {
            ConnectionState::Disconnected
        } else {
            ConnectionState::Connected
        }
    }

    pub fn disconnect_client(&mut self) -> bool {
        self.client.take().is_some()
    }

    pub fn on_connect(&mut self, mut client: Client<Scanner>) -> pdi_scanner::Result<()> {
        client.set_scan_resolution(Resolution::Half)?;
        client.set_color_mode(ColorMode::LowColor)?;
        client.set_scan_side_mode(ScanSideMode::Duplex)?;

        let mut remaining_attempts = 3;
        loop {
            match client.get_scanner_status(Duration::from_secs(100)) {
                Ok(status) => {
                    if status.rear_left_sensor_covered {
                        client.eject_document(EjectMotion::ToFront)?;
                    }
                    break;
                }
                Err(_) => {
                    let _ = client.get_test_string(Duration::from_millis(100));
                }
            }

            remaining_attempts -= 1;

            if remaining_attempts == 0 {
                return Err(pdi_scanner::Error::RecvTimeout(
                    RecvTimeoutError::Disconnected,
                ));
            }
        }

        self.client = Some(client);

        Ok(())
    }

    pub fn get_scanner_status(&mut self) -> Option<Status> {
        let Some(client) = self.client.as_mut() else {
            return None;
        };

        client.get_scanner_status(Duration::from_secs(1)).ok()
    }

    pub const fn get_auto_scan_config(&self) -> AutoScanConfig {
        self.auto_scan
    }

    pub fn set_auto_scan_config(&mut self, config: AutoScanConfig) {
        self.auto_scan = config;
    }

    pub const fn auto_eject_delay(&self) -> Duration {
        self.auto_eject_delay
    }

    pub fn increment_auto_eject_delay(&mut self) {
        self.auto_eject_delay += EJECT_DELAY_STEP;
    }

    pub fn decrement_auto_eject_delay(&mut self) {
        self.auto_eject_delay = self.auto_eject_delay.saturating_sub(EJECT_DELAY_STEP);
    }

    pub const fn get_watch_status_config(&self) -> WatchStatusConfig {
        self.watch_status
    }

    pub fn set_watch_status_config(&mut self, config: WatchStatusConfig) {
        self.watch_status = config;
    }

    pub const fn should_connect(&self) -> bool {
        self.should_connect
    }

    pub fn set_should_connect(&mut self, should_connect: bool) {
        self.should_connect = should_connect;
    }

    pub const fn should_disconnect(&self) -> bool {
        self.should_disconnect
    }

    pub fn set_should_disconnect(&mut self, should_disconnect: bool) {
        self.should_disconnect = should_disconnect;
    }

    pub const fn should_quit(&self) -> bool {
        self.should_quit
    }

    pub fn try_recv_matching(
        &mut self,
        predicate: impl Fn(&Incoming) -> bool,
    ) -> pdi_scanner::Result<Incoming> {
        self.get_client_mut()?.try_recv_matching(predicate)
    }

    pub fn eject_document(&mut self, eject_motion: EjectMotion) -> pdi_scanner::Result<()> {
        self.get_client_mut()?.eject_document(eject_motion)
    }

    pub fn set_feeder_mode(&mut self, mode: FeederMode) -> pdi_scanner::Result<()> {
        self.get_client_mut()?.set_feeder_mode(mode)
    }

    fn get_client_mut(&mut self) -> pdi_scanner::Result<&mut Client<Scanner>> {
        match self.client.as_mut() {
            Some(client) => Ok(client),
            None => Err(pdi_scanner::Error::TryRecvError(TryRecvError::Disconnected)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
}
