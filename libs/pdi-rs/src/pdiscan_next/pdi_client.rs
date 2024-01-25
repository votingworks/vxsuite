use std::{pin::Pin, str::from_utf8, sync::mpsc::RecvTimeoutError, time::Instant};

use nom::{
    bytes::complete::{tag, take, take_until},
    combinator::{map, map_res},
    number::complete::le_u8,
    sequence::tuple,
    IResult,
};
use rusb::{Context, Device, UsbContext};

use crate::pdiscan_next::transfer::Handler;

use super::transfer::{Command, Event};

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
                if let Ok((&[], test_string)) = parse_test_string_response(&data) {
                    self.get_test_string_response = Some(test_string.to_owned());
                } else if let Ok((&[], version)) = parse_firmware_version_response(&data) {
                    self.get_firmware_version_response = Some(version);
                } else if let Ok((&[], status)) = parse_scanner_status(&data) {
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

fn parse_test_string_response<'a>(input: &'a [u8]) -> IResult<&'a [u8], &'a str> {
    map(
        tuple((
            tag("\x02D"),
            map_res(take_until("\x03"), |bytes| from_utf8(bytes)),
            tag("\x03"),
        )),
        |(_, test_string, _)| test_string,
    )(input)
}

fn parse_firmware_version_response<'a>(input: &'a [u8]) -> IResult<&'a [u8], Version> {
    map(
        tuple((
            tag("\x02V"),
            map_res(take(4usize), |bytes| from_utf8(bytes)),
            map_res(take(2usize), |bytes| from_utf8(bytes)),
            map_res(take(2usize), |bytes| from_utf8(bytes)),
            map_res(take(1usize), |bytes| from_utf8(bytes)),
            tag("\x03"),
        )),
        |(_, product_id, major, minor, cpld_version, _)| {
            Version::new(
                product_id.to_owned(),
                major.to_owned(),
                minor.to_owned(),
                cpld_version.to_owned(),
            )
        },
    )(input)
}

fn parse_scanner_status(input: &[u8]) -> IResult<&[u8], Status> {
    map(
        tuple((tag("\x02Q"), le_u8, le_u8, le_u8, tag("\x03"))),
        |(_, byte0, byte1, byte2, _)| {
            Status::new(
                byte0 & 0b0000_0001 != 0,
                byte0 & 0b0000_0010 != 0,
                byte0 & 0b0000_0100 != 0,
                byte0 & 0b0000_1000 != 0,
                byte0 & 0b0001_0000 != 0,
                byte0 & 0b0100_0000 != 0,
                byte1 & 0b0000_0001 != 0,
                byte1 & 0b0000_0010 != 0,
                byte1 & 0b0000_0100 != 0,
                byte1 & 0b0000_1000 != 0,
                byte1 & 0b0001_0000 != 0,
                byte1 & 0b0010_0000 != 0,
                byte1 & 0b0100_0000 != 0,
                byte2 & 0b0000_0001 != 0,
                byte2 & 0b0000_0010 != 0,
                byte2 & 0b0000_0100 != 0,
                byte2 & 0b0000_1000 != 0,
                byte2 & 0b0001_0000 != 0,
                byte2 & 0b0010_0000 != 0,
                byte2 & 0b0100_0000 != 0,
            )
        },
    )(input)
}

#[derive(Debug)]
pub struct Version {
    product_id: String,
    major: String,
    minor: String,
    cpld_version: String,
}

impl Version {
    const fn new(product_id: String, major: String, minor: String, cpld_version: String) -> Self {
        Self {
            product_id,
            major,
            minor,
            cpld_version,
        }
    }
}

/// The status of the scanner.
///
/// Note: bit 7 of each byte is always set to 1.
#[derive(Debug, PartialEq)]
pub struct Status {
    /// Byte 0, Bit 0 (0x01)
    rear_left_sensor_covered: bool,
    /// Byte 0, Bit 1 (0x02) – omitted in UltraScan
    rear_right_sensor_covered: bool,
    /// Byte 0, Bit 2 (0x04)
    brander_position_sensor_covered: bool,
    /// Byte 0, Bit 3 (0x08)
    hi_speed_mode: bool,
    /// Byte 0, Bit 4 (0x10)
    download_needed: bool,
    /// Byte 0, Bit 5 (0x20) – not defined
    /// future_use: bool,
    /// Byte 0, Bit 6 (0x40)
    scanner_enabled: bool,

    /// Byte 1, Bit 0 (0x01)
    front_left_sensor_covered: bool,
    /// Byte 1, Bit 1 (0x02) – omitted in UltraScan
    front_m1_sensor_covered: bool,
    /// Byte 1, Bit 2 (0x04) – omitted in UltraScan
    front_m2_sensor_covered: bool,
    /// Byte 1, Bit 3 (0x08) – omitted in UltraScan
    front_m3_sensor_covered: bool,
    /// Byte 1, Bit 4 (0x10) – omitted in UltraScan
    front_m4_sensor_covered: bool,
    /// Byte 1, Bit 5 (0x20) – omitted in Duplex and UltraScan
    front_m5_sensor_covered: bool,
    /// Byte 1, Bit 6 (0x40) – omitted in Duplex and UltraScan
    front_right_sensor_covered: bool,

    /// Byte 2, Bit 0 (0x01)
    scanner_ready: bool,
    /// Byte 2, Bit 1 (0x02) – com error
    xmt_aborted: bool,
    /// Byte 2, Bit 2 (0x04)
    document_jam: bool,
    /// Byte 2, Bit 3 (0x08)
    scan_array_pixel_error: bool,
    /// Byte 2, Bit 4 (0x10)
    in_diagnostic_mode: bool,
    /// Byte 2, Bit 5 (0x20)
    document_in_scanner: bool,
    /// Byte 2, Bit 6 (0x40)
    calibration_of_unit_needed: bool,
}

impl Status {
    pub const fn new(
        rear_left_sensor_covered: bool,
        rear_right_sensor_covered: bool,
        brander_position_sensor_covered: bool,
        hi_speed_mode: bool,
        download_needed: bool,
        scanner_enabled: bool,
        front_left_sensor_covered: bool,
        front_m1_sensor_covered: bool,
        front_m2_sensor_covered: bool,
        front_m3_sensor_covered: bool,
        front_m4_sensor_covered: bool,
        front_m5_sensor_covered: bool,
        front_right_sensor_covered: bool,
        scanner_ready: bool,
        xmt_aborted: bool,
        document_jam: bool,
        scan_array_pixel_error: bool,
        in_diagnostic_mode: bool,
        document_in_scanner: bool,
        calibration_of_unit_needed: bool,
    ) -> Self {
        Self {
            rear_left_sensor_covered,
            rear_right_sensor_covered,
            brander_position_sensor_covered,
            hi_speed_mode,
            download_needed,
            scanner_enabled,
            front_left_sensor_covered,
            front_m1_sensor_covered,
            front_m2_sensor_covered,
            front_m3_sensor_covered,
            front_m4_sensor_covered,
            front_m5_sensor_covered,
            front_right_sensor_covered,
            scanner_ready,
            xmt_aborted,
            document_jam,
            scan_array_pixel_error,
            in_diagnostic_mode,
            document_in_scanner,
            calibration_of_unit_needed,
        }
    }
}
