use std::{
    sync::{
        mpsc::{RecvTimeoutError, TryRecvError},
        Arc,
    },
    time::Duration,
};

use ratatui::text::Line;

use pdi_rs::pdiscan::{
    client::{Client, Error},
    protocol::{
        types::{ColorMode, EjectMotion, Resolution, ScanSideMode, Status},
        Event,
    },
};

use super::{
    config::{AutoScanConfig, WatchStatusConfig, EJECT_DELAY_STEP},
    log::LogEntry,
};

#[derive(Debug, Clone)]
pub enum Route {
    Disconnected,
    Main { client: Arc<Client> },
    AutoScan { client: Arc<Client> },
    Calibrate { client: Arc<Client> },
}

impl Route {
    pub fn client(&self) -> Option<Arc<Client>> {
        match &self {
            Self::Calibrate { client } | Self::AutoScan { client } | Self::Main { client } => {
                Some(client.clone())
            }
            Self::Disconnected => None,
        }
    }
}

const MAX_LOG_LENGTH: usize = 500;

// App state
pub struct App<'a> {
    navigation_stack: Vec<Route>,
    log: Vec<LogEntry<'a>>,
    next_scan_index: usize,
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
            navigation_stack: vec![Route::Disconnected],
            log: vec![],
            next_scan_index: 1,
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

    pub fn quit(&mut self) {
        self.should_quit = true;
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
        } else if self.client().is_none() {
            ConnectionState::Disconnected
        } else {
            ConnectionState::Connected
        }
    }

    pub fn disconnect_client(&mut self) -> bool {
        let client = self.client();
        self.navigation_stack.clear();
        self.navigation_stack.push(Route::Disconnected);
        client.is_some()
    }

    pub fn on_connect(&mut self, mut client: Client) {
        client.set_scan_resolution(Resolution::Half);
        client.set_color_mode(ColorMode::LowColor);
        client.set_scan_side_mode(ScanSideMode::Duplex);

        let status = client.get_scanner_status(None).unwrap();

        if status.rear_left_sensor_covered {
            client.eject_document(EjectMotion::ToFront);
        }

        self.navigation_stack.push(Route::Main {
            client: Arc::new(client),
        });
    }

    pub fn get_scanner_status(&mut self) -> Option<Status> {
        let Some(mut client) = self.client() else {
            return None;
        };

        client.get_scanner_status(None).ok()
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

    pub fn increment_scan_index(&mut self) -> usize {
        let index = self.next_scan_index;
        self.next_scan_index += 1;
        index
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

    pub fn await_event(
        &mut self,
        timeout: impl Into<Option<Duration>>,
    ) -> Result<Event, RecvTimeoutError> {
        if let Some(client) = self.client() {
            return match client.await_event(timeout) {
                Ok(event) => Ok(event),
                Err(Error::RecvTimeout(_)) => Err(RecvTimeoutError::Timeout),
                Err(_) => Err(RecvTimeoutError::Disconnected),
            };
        }

        Err(RecvTimeoutError::Disconnected)
    }

    pub fn eject_document(&mut self, eject_motion: EjectMotion) -> Result<(), TryRecvError> {
        let Some(mut client) = self.client() else {
            return Err(TryRecvError::Disconnected);
        };

        client.eject_document(eject_motion);

        Ok(())
    }

    pub fn current_route(&self) -> Option<Route> {
        self.navigation_stack.last().cloned()
    }

    pub fn set_feeder_enabled(&mut self, enabled: bool) -> Result<(), TryRecvError> {
        let Some(client) = self.client() else {
            return Err(TryRecvError::Disconnected);
        };

        client.set_feeder_enabled(enabled);

        Ok(())
    }

    fn client(&self) -> Option<Arc<Client>> {
        self.current_route()?.client()
    }

    pub fn navigate_to_calibration_menu(&mut self) {
        let Some(client) = self.client() else {
            return;
        };

        self.navigation_stack.push(Route::Calibrate { client });
    }

    pub fn navigate_back(&mut self) {
        let client = self.client();

        self.navigation_stack.pop();

        if self.navigation_stack.is_empty() {
            self.navigation_stack.push(match client {
                Some(client) => Route::Main { client },
                None => Route::Disconnected,
            });
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
}
