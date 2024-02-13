use std::{
    sync::mpsc::{RecvTimeoutError, TryRecvError},
    time::Duration,
};

use ratatui::text::Line;

use pdi_rs::pdiscan::{
    client::{Client, Error},
    protocol::{types::EjectMotion, Event},
};

use super::{
    config::{AutoScanConfig, WatchStatusConfig, EJECT_DELAY_STEP},
    log::LogEntry,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    Disconnected,
    Main,
    AutoScan,
    Calibrate,
}

const MAX_LOG_LENGTH: usize = 500;

// App state
pub struct App<'a> {
    navigation_stack: Vec<Route>,
    client: Option<Client>,
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
            client: None,
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

    pub const fn connection_state(&self) -> ConnectionState {
        if self.should_connect {
            ConnectionState::Connecting
        } else if self.client.is_none() {
            ConnectionState::Disconnected
        } else {
            ConnectionState::Connected
        }
    }

    pub fn disconnect_client(&mut self) -> bool {
        self.navigation_stack.clear();
        self.navigation_stack.push(Route::Disconnected);
        self.client.take().is_some()
    }

    pub fn get_client(&mut self) -> Option<&mut Client> {
        self.client.as_mut()
    }

    pub fn set_client(&mut self, scanner: Option<Client>) {
        self.client = scanner;
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
        if let Some(client) = &mut self.client {
            return match client.await_event(timeout) {
                Ok(event) => Ok(event),
                Err(Error::RecvTimeout(_)) => Err(RecvTimeoutError::Timeout),
                Err(_) => Err(RecvTimeoutError::Disconnected),
            };
        }

        Err(RecvTimeoutError::Disconnected)
    }

    pub fn eject_document(&mut self, eject_motion: EjectMotion) -> Result<(), TryRecvError> {
        let Some(client) = &mut self.client else {
            return Err(TryRecvError::Disconnected);
        };

        client.eject_document(eject_motion);

        Ok(())
    }

    pub fn navigate_to_calibration_menu(&mut self) {
        self.navigation_stack.push(Route::Calibrate);
    }

    pub fn navigate_back(&mut self) {
        self.navigation_stack.pop();
        if self.navigation_stack.is_empty() {
            self.navigation_stack.push(if self.client.is_some() {
                Route::Main
            } else {
                Route::Disconnected
            });
        }
    }

    pub fn current_route(&self) -> Route {
        *self.navigation_stack.last().unwrap()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
}
