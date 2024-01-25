use rusb::{Context, Device, UsbContext};
use std::{pin::Pin, sync::mpsc::RecvTimeoutError, time::Instant};

use crate::pdiscan_next::transfer::Handler;

use super::{
    protocol::{parsers, Command, Status, Version},
    transfer::Event,
};

const VENDOR_ID: u16 = 0x0bd7;
const PRODUCT_ID: u16 = 0xa002;
const ENDPOINT_OUT: u8 = 0x05;
const ENDPOINT_IN: u8 = 0x85;
const ENDPOINT_IN_ALT: u8 = 0x86;

#[derive(Debug)]
pub struct PdiClient {
    /// We need to keep the device around so that it doesn't get dropped and
    /// closed, but we don't actually need to do anything with it.
    _device: Device<Context>,

    /// The transfer handler is responsible for managing the libusb transfers
    /// and handling the callbacks. It needs to be pinned because it passes
    /// a pointer to itself to libusb, and we need to ensure that the pointer
    /// remains valid.
    transfer_handler: Pin<Box<Handler>>,

    /// Receiver for events from the transfer handler.
    event_rx: std::sync::mpsc::Receiver<Event>,

    get_test_string_response: Option<String>,
    get_firmware_version_response: Option<Version>,
    get_scanner_status_response: Option<Status>,
}

impl PdiClient {
    pub fn open() -> Result<Self, rusb::Error> {
        let ctx = rusb::Context::new()?;
        let Some(device) = ctx.devices()?.iter().find(|device| {
            let device_desc = device.device_descriptor().unwrap();
            device_desc.vendor_id() == VENDOR_ID && device_desc.product_id() == PRODUCT_ID
        }) else {
            return Err(rusb::Error::NotFound);
        };

        let mut device_handle = device.open()?;
        device_handle.set_active_configuration(1)?;
        device_handle.claim_interface(0)?;

        let output_endpoint = ENDPOINT_OUT;
        let input_endpoints = &[ENDPOINT_IN, ENDPOINT_IN_ALT];

        let (tx, rx) = std::sync::mpsc::channel();
        let mut client = Self {
            _device: device,
            transfer_handler: Box::pin(Handler::new(
                device_handle,
                output_endpoint,
                input_endpoints,
                tx,
            )),
            event_rx: rx,
            get_test_string_response: None,
            get_firmware_version_response: None,
            get_scanner_status_response: None,
        };

        client.transfer_handler.start_handle_events_thread();

        Ok(client)
    }

    pub fn send_command(&mut self, command: Command) {
        self.transfer_handler
            .submit_transfer(&command.to_bytes().as_slice());
    }

    pub fn get_test_string(
        &mut self,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<String, RecvTimeoutError> {
        if let Some(test_string) = self.get_test_string_response.take() {
            tracing::warn!("get_test_string: found a cached response: {test_string:?}");
        }

        self.send_command(Command::new(b"D"));

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            if let Some(test_string) = self.get_test_string_response.take() {
                return Ok(test_string);
            }
        }
    }

    pub fn get_firmware_version(
        &mut self,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<Version, RecvTimeoutError> {
        if let Some(version) = self.get_firmware_version_response.take() {
            tracing::warn!("get_firmware_version: found a cached response: {version:?}");
        }

        self.send_command(Command::new(b"V"));

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            if let Some(version) = self.get_firmware_version_response.take() {
                return Ok(version);
            }
        }
    }

    pub fn get_scanner_status(
        &mut self,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<Status, RecvTimeoutError> {
        if let Some(status) = self.get_scanner_status_response.take() {
            tracing::warn!("get_scanner_status: found a cached response: {status:?}");
        }

        self.send_command(Command::new(b"Q"));

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            if let Some(status) = self.get_scanner_status_response.take() {
                return Ok(status);
            }
        }
    }

    fn await_event(
        &mut self,
        deadline: impl Into<Option<std::time::Instant>>,
    ) -> Result<(), RecvTimeoutError> {
        let event = match deadline.into() {
            Some(deadline) => self.event_rx.recv_timeout(
                deadline
                    .checked_duration_since(Instant::now())
                    .unwrap_or_default(),
            )?,
            None => self.event_rx.recv().unwrap(),
        };

        if event.is_out() {
            return Ok(());
        }

        match event {
            Event::Completed { data, .. } => {
                if let Ok((&[], test_string)) = parsers::get_test_string_response(&data) {
                    self.get_test_string_response = Some(test_string.to_owned());
                } else if let Ok((&[], version)) = parsers::get_firmware_version_response(&data) {
                    self.get_firmware_version_response = Some(version);
                } else if let Ok((&[], status)) = parsers::get_scanner_status_response(&data) {
                    self.get_scanner_status_response = Some(status);
                } else {
                    tracing::warn!("unknown data from scanner: {data:?}");
                }
            }
            Event::Cancelled { endpoint } => {
                tracing::debug!("received cancelled event: {endpoint:02x}");
            }
        }

        Ok(())
    }
}

impl Drop for PdiClient {
    fn drop(&mut self) {
        tracing::trace!("PdiClient::drop: calling stop_handle_events_thread");
        self.transfer_handler.stop_handle_events_thread();
    }
}
