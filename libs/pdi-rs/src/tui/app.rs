use std::sync::Arc;

use ratatui::text::Line;

use crate::pdiscan::Scanner;

use super::{
    config::{AutoScanConfig, WatchStatusConfig},
    log::LogEntry,
};

// App state
pub(crate) struct App<'a> {
    scanner: Option<Arc<Scanner>>,
    log: Vec<LogEntry<'a>>,
    next_scan_index: usize,
    auto_scan: AutoScanConfig,
    watch_status: WatchStatusConfig,
    should_connect: bool,
    should_disconnect: bool,
    should_quit: bool,
}

impl<'a> App<'a> {
    pub fn new() -> Self {
        Self {
            scanner: None,
            log: vec![],
            next_scan_index: 1,
            auto_scan: Default::default(),
            watch_status: Default::default(),
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
        self.log.push(LogEntry::new(line));

        const MAX_LOG_LENGTH: usize = 500;
        if self.log.len() > MAX_LOG_LENGTH {
            self.log.drain(0..self.log.len() - MAX_LOG_LENGTH);
        }
    }

    pub fn log_entries(&self, count: usize) -> &[LogEntry<'a>] {
        &self.log[self.log.len().saturating_sub(count)..]
    }

    pub fn connection_state(&self) -> ConnectionState {
        if self.should_connect {
            ConnectionState::Connecting
        } else if self.scanner.is_none() {
            ConnectionState::Disconnected
        } else {
            ConnectionState::Connected
        }
    }

    pub fn get_scanner(&self) -> Option<Arc<Scanner>> {
        self.scanner.clone()
    }

    pub fn set_scanner(&mut self, scanner: Option<Arc<Scanner>>) {
        self.scanner = scanner;
    }

    pub fn get_auto_scan_config(&self) -> AutoScanConfig {
        self.auto_scan
    }

    pub fn set_auto_scan_config(&mut self, config: AutoScanConfig) {
        self.auto_scan = config;
    }

    pub fn get_watch_status_config(&self) -> WatchStatusConfig {
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

    pub fn should_connect(&self) -> bool {
        self.should_connect
    }

    pub fn set_should_connect(&mut self, should_connect: bool) {
        self.should_connect = should_connect;
    }

    pub fn should_disconnect(&self) -> bool {
        self.should_disconnect
    }

    pub fn set_should_disconnect(&mut self, should_disconnect: bool) {
        self.should_disconnect = should_disconnect;
    }

    pub fn should_quit(&self) -> bool {
        self.should_quit
    }
}

pub(crate) enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
}
