use std::{
    pin::Pin,
    str::from_utf8,
    sync::mpsc::{RecvError, RecvTimeoutError},
    thread,
    time::{Duration, Instant},
};

use nom::{
    bytes::complete::{tag, take, take_until},
    combinator::{map, map_res},
    number::complete::le_u8,
    sequence::tuple,
    IResult,
};
use rusb::{
    constants::{
        LIBUSB_TRANSFER_CANCELLED, LIBUSB_TRANSFER_COMPLETED, LIBUSB_TRANSFER_ERROR,
        LIBUSB_TRANSFER_FREE_BUFFER, LIBUSB_TRANSFER_FREE_TRANSFER, LIBUSB_TRANSFER_NO_DEVICE,
        LIBUSB_TRANSFER_OVERFLOW, LIBUSB_TRANSFER_STALL, LIBUSB_TRANSFER_TIMED_OUT,
    },
    ffi::{
        libusb_alloc_transfer, libusb_cancel_transfer, libusb_fill_bulk_transfer,
        libusb_free_transfer, libusb_handle_events, libusb_submit_transfer, libusb_transfer,
    },
    Context, Device, DeviceHandle, UsbContext,
};

const VENDOR_ID: u16 = 0x0bd7;
const PRODUCT_ID: u16 = 0xa002;
const ENDPOINT_OUT: u8 = 0x05;
const ENDPOINT_IN: u8 = 0x85;
const ENDPOINT_IN_ALT: u8 = 0x86;

extern "system" fn libusb_transfer_callback(transfer: *mut libusb_transfer) {
    tracing::debug!("libusb_transfer_callback: transfer={transfer:?}");
    let handler = unsafe { &mut *((*transfer).user_data as *mut TransferHandler) };

    handler.on_transfer_teardown(transfer);

    match unsafe { (*transfer).status } {
        LIBUSB_TRANSFER_COMPLETED => {
            handler.on_transfer_completed(transfer);
        }
        LIBUSB_TRANSFER_ERROR => {
            handler.on_transfer_error(transfer);
        }
        LIBUSB_TRANSFER_TIMED_OUT => {
            handler.on_transfer_timed_out(transfer);
        }
        LIBUSB_TRANSFER_CANCELLED => {
            handler.on_transfer_cancelled(transfer);
        }
        LIBUSB_TRANSFER_STALL => {
            handler.on_transfer_stall(transfer);
        }
        LIBUSB_TRANSFER_NO_DEVICE => {
            handler.on_transfer_no_device(transfer);
        }
        LIBUSB_TRANSFER_OVERFLOW => {
            handler.on_transfer_overflow(transfer);
        }
        _ => {
            tracing::warn!("unknown transfer status: {:02x}", unsafe {
                (*transfer).status
            });
        }
    }
}

#[derive(Debug)]
struct PdiClientInput {
    endpoint: u8,
    transfer: *mut libusb_transfer,
}

impl PdiClientInput {
    pub fn new(endpoint: u8) -> Self {
        let transfer = unsafe { libusb_alloc_transfer(0) };

        assert!(
            !transfer.is_null(),
            "PdiClientInput::new: libusb_alloc_transfer failed"
        );

        Self { endpoint, transfer }
    }
}

impl Drop for PdiClientInput {
    fn drop(&mut self) {
        tracing::trace!(
            "PdiClientInput::drop: freeing transfer: {:?}",
            self.transfer
        );
        unsafe {
            libusb_free_transfer(self.transfer);
        }
    }
}

#[derive(Debug)]
pub enum Event {
    Completed { endpoint: u8, data: Vec<u8> },
    Cancelled { endpoint: u8 },
}

impl Event {
    pub fn endpoint(&self) -> u8 {
        match self {
            Self::Completed { endpoint, .. } => *endpoint,
            Self::Cancelled { endpoint } => *endpoint,
        }
    }

    pub fn is_in(&self) -> bool {
        self.endpoint() & 0x80 != 0
    }

    pub fn is_out(&self) -> bool {
        !self.is_in()
    }
}

#[derive(Debug)]
struct TransferHandler {
    device_handle: DeviceHandle<Context>,
    output_endpoint: u8,
    inputs: Vec<PdiClientInput>,
    handle_events_thread: Option<(thread::JoinHandle<()>, std::sync::mpsc::Sender<()>)>,
    pending_transfers: Vec<*mut libusb_transfer>,
    tx: std::sync::mpsc::Sender<Event>,
}

impl TransferHandler {
    fn new(
        device_handle: DeviceHandle<Context>,
        output_endpoint: u8,
        inputs: Vec<PdiClientInput>,
        tx: std::sync::mpsc::Sender<Event>,
    ) -> Self {
        Self {
            device_handle,
            output_endpoint,
            inputs,
            handle_events_thread: None,
            pending_transfers: vec![],
            tx,
        }
    }

    #[tracing::instrument]
    fn start_handle_events_thread(&mut self) {
        for input in self.inputs.iter() {
            // SAFETY: we're passing ownership of `buffer` to libusb, which will free
            // it when freeing the transfer because we set the `LIBUSB_TRANSFER_FREE_BUFFER`
            // flag below.
            let buffer = Box::leak(vec![0; 4096].into_boxed_slice());

            unsafe {
                let transfer_handler_ptr = self as *const _ as *mut _;
                tracing::trace!("transfer_handler_ptr={transfer_handler_ptr:?}");

                libusb_fill_bulk_transfer(
                    input.transfer,
                    self.device_handle.as_raw(),
                    input.endpoint,
                    buffer.as_mut_ptr(),
                    buffer.len() as i32,
                    libusb_transfer_callback,
                    transfer_handler_ptr,
                    0,
                );

                // SAFETY: ensure that `buffer` is freed when the transfer is freed.
                (*input.transfer).flags |= LIBUSB_TRANSFER_FREE_BUFFER;

                tracing::debug!("submitting input transfer: {:?}", input.transfer);
                libusb_submit_transfer(input.transfer);
                self.pending_transfers.push(input.transfer);
            }
        }

        let (quit_tx, quit_rx) = std::sync::mpsc::channel();
        let ctx = self.device_handle.context().clone();
        self.handle_events_thread = Some((
            thread::spawn(move || {
                let _entered =
                    tracing::span!(tracing::Level::TRACE, "handle_events_thread").entered();
                loop {
                    if let Ok(_) = quit_rx.try_recv() {
                        tracing::trace!("thread::spawn: quitting handle events thread");
                        break;
                    }

                    tracing::trace!("calling libusb_handle_events");
                    let result = unsafe { libusb_handle_events(ctx.as_raw()) };
                    if result < 0 {
                        tracing::error!("libusb handle events failed: {result}");
                    }
                }
            }),
            quit_tx,
        ));
    }

    #[tracing::instrument]
    fn stop_handle_events_thread(&mut self) {
        if let Some((thread, quit_tx)) = self.handle_events_thread.take() {
            tracing::debug!(
                "cancelling pending transfers: {}",
                self.pending_transfers.len()
            );
            for pending_transfer in self.pending_transfers.iter() {
                tracing::debug!("cancelling pending transfer: {pending_transfer:?}");
                unsafe { libusb_cancel_transfer(*pending_transfer) };
            }
            self.pending_transfers.clear();
            tracing::debug!("sending quit message");
            quit_tx.send(()).unwrap();

            tracing::debug!("releasing device handle interface");
            self.device_handle.release_interface(0).unwrap();

            tracing::debug!("joining handle events thread");
            thread.join().unwrap();
        }
    }

    #[tracing::instrument]
    fn submit_transfer(&mut self, data: &[u8]) {
        // SAFETY: we're passing ownership of `transfer` to libusb, which will free
        // it when it's done with it because we set the `LIBUSB_TRANSFER_FREE_TRANSFER`
        // flag below.
        let transfer = unsafe { libusb_alloc_transfer(0) };

        assert!(
            !transfer.is_null(),
            "send_command: libusb_alloc_transfer failed"
        );

        let command = Command::new(data);
        let bytes = command.to_bytes();

        // SAFETY: we leak `bytes` because we're passing ownership to libusb.
        // libusb will free the buffer when it's done with it because we set the
        // `LIBUSB_TRANSFER_FREE_BUFFER` flag below.
        let bytes = Box::leak(bytes.into_boxed_slice());

        unsafe {
            let transfer_handler_ptr = self as *const _ as *mut _;
            tracing::trace!("transfer_handler_ptr={transfer_handler_ptr:?}");

            libusb_fill_bulk_transfer(
                transfer,
                self.device_handle.as_raw(),
                self.output_endpoint,
                bytes.as_mut_ptr(),
                bytes.len() as i32,
                libusb_transfer_callback,
                transfer_handler_ptr,
                0,
            );

            // SAFETY: ensure that both `bytes` and `transfer` are freed when the
            // transfer is complete.
            (*transfer).flags |= LIBUSB_TRANSFER_FREE_BUFFER | LIBUSB_TRANSFER_FREE_TRANSFER;

            // pass ownership of `transfer` and `bytes` to libusb
            libusb_submit_transfer(transfer);
            self.pending_transfers.push(transfer);
        }
    }

    #[tracing::instrument]
    fn on_transfer_teardown(&mut self, transfer: *mut libusb_transfer) {
        self.pending_transfers.retain(|&t| t != transfer);
    }

    #[tracing::instrument]
    fn on_transfer_completed(&mut self, transfer: *mut libusb_transfer) {
        if unsafe { (*transfer).status } == LIBUSB_TRANSFER_COMPLETED {
            match unsafe { (*transfer).endpoint } {
                endpoint if endpoint == self.output_endpoint => {
                    tracing::debug!("transfer completed on OUT endpoint")
                }
                endpoint if self.inputs.iter().any(|input| input.endpoint == endpoint) => {
                    tracing::debug!("transfer completed on IN endpoint");

                    let actual_length = unsafe { (*transfer).actual_length } as usize;

                    tracing::debug!("received bytes: {actual_length}");

                    let data =
                        unsafe { std::slice::from_raw_parts((*transfer).buffer, actual_length) };

                    if let Err(e) = self.tx.send(Event::Completed {
                        endpoint,
                        data: data.to_vec(),
                    }) {
                        tracing::error!("failed to send event: {e}");
                    }

                    tracing::debug!(
                        "received data as UTF-8 string: {:?}",
                        std::str::from_utf8(data)
                    );

                    unsafe { libusb_submit_transfer(transfer) };
                    self.pending_transfers.push(transfer);
                }
                endpoint => {
                    tracing::warn!("transfer completed on unknown endpoint: {endpoint:02x}")
                }
            }
        }
    }

    #[tracing::instrument]
    fn on_transfer_cancelled(&mut self, transfer: *mut libusb_transfer) {
        if let Err(e) = self.tx.send(Event::Cancelled {
            endpoint: unsafe { (*transfer).endpoint },
        }) {
            tracing::error!("failed to send event: {e}");
        }
    }

    #[tracing::instrument]
    fn on_transfer_error(&mut self, transfer: *mut libusb_transfer) {}

    #[tracing::instrument]
    fn on_transfer_timed_out(&mut self, transfer: *mut libusb_transfer) {}

    #[tracing::instrument]
    fn on_transfer_stall(&mut self, transfer: *mut libusb_transfer) {}

    #[tracing::instrument]
    fn on_transfer_no_device(&mut self, transfer: *mut libusb_transfer) {}

    #[tracing::instrument]
    fn on_transfer_overflow(&mut self, transfer: *mut libusb_transfer) {}
}

#[derive(Debug)]
pub struct PdiClient {
    /// We need to keep the device around so that it doesn't get dropped and
    /// closed, but we don't actually need to do anything with it.
    _device: Device<Context>,

    /// The transfer handler is responsible for managing the libusb transfers
    /// and handling the callbacks. It needs to be pinned because it passes
    /// a pointer to itself to libusb, and we need to ensure that the pointer
    /// remains valid.
    transfer_handler: Pin<Box<TransferHandler>>,

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
        let inputs = input_endpoints
            .iter()
            .map(|&endpoint| PdiClientInput::new(endpoint))
            .collect();

        let (tx, rx) = std::sync::mpsc::channel();
        let mut client = Self {
            _device: device,
            transfer_handler: Box::pin(TransferHandler::new(
                device_handle,
                output_endpoint,
                inputs,
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
#[derive(Debug)]
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

#[derive(Debug)]
pub struct Command<'a> {
    data: &'a [u8],
}

impl<'a> Command<'a> {
    pub const fn new(data: &'a [u8]) -> Self {
        Self { data }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        const START_BYTE: u8 = 0x02;
        const END_BYTE: u8 = 0x03;
        let mut bytes = Vec::with_capacity(self.data.len() + 2);
        bytes.push(START_BYTE);
        bytes.extend_from_slice(self.data);
        bytes.push(END_BYTE);
        bytes.push(self.crc());
        bytes
    }

    fn crc(&self) -> u8 {
        const POLYNOMIAL: u8 = 0x97;
        self.data.iter().fold(0, |crc, byte| {
            let mut crc = crc ^ byte;
            for _ in 0..8 {
                if crc & 0x80 != 0 {
                    crc = (crc << 1) ^ POLYNOMIAL;
                } else {
                    crc <<= 1;
                }
            }
            crc
        })
    }
}
