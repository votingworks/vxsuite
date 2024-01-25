use std::thread;

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
    Context, DeviceHandle, UsbContext,
};

extern "system" fn libusb_transfer_callback(transfer: *mut libusb_transfer) {
    tracing::debug!("libusb_transfer_callback: transfer={transfer:?}");
    let handler = unsafe { &mut *((*transfer).user_data as *mut Handler) };

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
pub(crate) struct Handler {
    device_handle: DeviceHandle<Context>,
    output_endpoint: u8,
    inputs: Vec<Input>,
    handle_events_thread: Option<(thread::JoinHandle<()>, std::sync::mpsc::Sender<()>)>,
    pending_transfers: Vec<*mut libusb_transfer>,
    tx: std::sync::mpsc::Sender<Event>,
}

impl Handler {
    pub fn new(
        device_handle: DeviceHandle<Context>,
        output_endpoint: u8,
        input_endpoints: &[u8],
        tx: std::sync::mpsc::Sender<Event>,
    ) -> Self {
        let inputs = input_endpoints
            .iter()
            .map(|&endpoint| Input::new(endpoint))
            .collect();

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
    pub fn start_handle_events_thread(&mut self) {
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
    pub fn stop_handle_events_thread(&mut self) {
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
    pub fn submit_transfer(&mut self, data: &[u8]) {
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
struct Input {
    endpoint: u8,
    transfer: *mut libusb_transfer,
}

impl Input {
    pub fn new(endpoint: u8) -> Self {
        let transfer = unsafe { libusb_alloc_transfer(0) };

        assert!(
            !transfer.is_null(),
            "PdiClientInput::new: libusb_alloc_transfer failed"
        );

        Self { endpoint, transfer }
    }
}

impl Drop for Input {
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
