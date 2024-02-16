use std::{
    ffi::c_void,
    ptr::NonNull,
    sync::{atomic::AtomicBool, mpsc},
    thread,
};

use rusb::{
    constants::{
        LIBUSB_TRANSFER_CANCELLED, LIBUSB_TRANSFER_COMPLETED, LIBUSB_TRANSFER_ERROR,
        LIBUSB_TRANSFER_FREE_BUFFER, LIBUSB_TRANSFER_FREE_TRANSFER, LIBUSB_TRANSFER_NO_DEVICE,
        LIBUSB_TRANSFER_OVERFLOW, LIBUSB_TRANSFER_STALL, LIBUSB_TRANSFER_TIMED_OUT,
    },
    ffi::{
        self, libusb_alloc_transfer, libusb_cancel_transfer, libusb_fill_bulk_transfer,
        libusb_free_transfer, libusb_handle_events, libusb_submit_transfer, libusb_transfer,
    },
    Context, DeviceHandle, UsbContext,
};

use crate::pdiscan::protocol::packets::Command;

extern "system" fn libusb_transfer_callback(transfer: *mut libusb_transfer) {
    tracing::debug!("libusb_transfer_callback: transfer={transfer:?}");
    let handler = unsafe { &mut *(*transfer).user_data.cast::<Handler>() };

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
    #[must_use]
    pub const fn endpoint(&self) -> u8 {
        match self {
            Self::Completed { endpoint, .. } | Self::Cancelled { endpoint } => *endpoint,
        }
    }

    #[must_use]
    pub const fn is_in(&self) -> bool {
        self.endpoint() & 0x80 != 0
    }

    #[must_use]
    pub const fn is_out(&self) -> bool {
        !self.is_in()
    }
}

#[derive(Debug)]
struct Transfer {
    ptr: NonNull<libusb_transfer>,
    buffer: Vec<u8>,
}

impl Transfer {
    pub fn bulk(device: &DeviceHandle<Context>, endpoint: u8, mut buffer: Vec<u8>) -> Self {
        let ptr = NonNull::new(unsafe { ffi::libusb_alloc_transfer(0) })
            .expect("libusb_alloc_transfer failed");

        let length = if endpoint & ffi::constants::LIBUSB_ENDPOINT_DIR_MASK
            == ffi::constants::LIBUSB_ENDPOINT_OUT
        {
            // for OUT endpoints: the currently valid data in the buffer
            buffer.len()
        } else {
            // for IN endpoints: the full capacity
            buffer.capacity()
        }
        .try_into()
        .unwrap();

        let user_data = Box::into_raw(Box::new(AtomicBool::new(false))).cast::<c_void>();

        unsafe {
            ffi::libusb_fill_bulk_transfer(
                ptr.as_ptr(),
                device.as_raw(),
                endpoint,
                buffer.as_mut_ptr(),
                length,
                Self::libusb_callback,
                user_data,
                0,
            );
        }

        Self { ptr, buffer }
    }

    fn transfer(&self) -> &ffi::libusb_transfer {
        // Safety: transfer remains valid as long as self
        unsafe { self.ptr.as_ref() }
    }

    pub fn as_raw(&mut self) -> *mut libusb_transfer {
        self.ptr.as_ptr()
    }

    pub fn buffer(&mut self) -> &Vec<u8> {
        &self.buffer
    }

    fn completed_flag(&self) -> &AtomicBool {
        // Safety: transfer and user_data remain valid as long as self
        unsafe { &*self.transfer().user_data.cast::<AtomicBool>() }
    }

    /// Prerequisite: self.buffer ans self.ptr are both correctly set
    fn swap_buffer(&mut self, new_buf: Vec<u8>) -> Vec<u8> {
        let transfer_struct = unsafe { self.ptr.as_mut() };

        let data = std::mem::replace(&mut self.buffer, new_buf);

        // Update transfer struct for new buffer
        transfer_struct.actual_length = 0; // TODO: Is this necessary?
        transfer_struct.buffer = self.buffer.as_mut_ptr();
        transfer_struct.length = self.buffer.capacity() as i32;

        data
    }

    // Step 3 of async API
    fn submit(&mut self) -> Result<()> {
        self.completed_flag().store(false, Ordering::SeqCst);
        let errno = unsafe { ffi::libusb_submit_transfer(self.ptr.as_ptr()) };

        match errno {
            0 => Ok(()),
            LIBUSB_ERROR_NO_DEVICE => Err(Error::Disconnected),
            LIBUSB_ERROR_BUSY => {
                unreachable!("We shouldn't be calling submit on transfers already submitted!")
            }
            LIBUSB_ERROR_NOT_SUPPORTED => Err(Error::Other("Transfer not supported")),
            LIBUSB_ERROR_INVALID_PARAM => {
                Err(Error::Other("Transfer size bigger than OS supports"))
            }
            _ => Err(Error::Errno("Error while submitting transfer: ", errno)),
        }
    }

    fn cancel(&mut self) {
        unsafe {
            ffi::libusb_cancel_transfer(self.ptr.as_ptr());
        }
    }

    extern "system" fn libusb_callback(transfer: *mut libusb_transfer) {
        tracing::debug!("libusb_callback: transfer={transfer:?}");
        let handler = unsafe { &mut *(*transfer).user_data.cast::<Handler>() };
    }
}

#[derive(Debug)]
pub(crate) struct Handler {
    device_handle: DeviceHandle<Context>,
    output_endpoint: u8,
    inputs: Vec<Input>,
    handle_events_thread: Option<(thread::JoinHandle<()>, std::sync::mpsc::Sender<()>)>,
    pending_transfers: Vec<Transfer>,
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
        for input in &self.inputs {
            unsafe {
                let transfer_handler_ptr = self as *const _ as *mut _;
                tracing::trace!("transfer_handler_ptr={transfer_handler_ptr:?}");

                libusb_fill_bulk_transfer(
                    input.transfer.as_raw(),
                    self.device_handle.as_raw(),
                    input.endpoint,
                    input.transfer.buffer().as_mut_ptr(),
                    input.transfer.buffer().len() as i32,
                    libusb_transfer_callback,
                    transfer_handler_ptr,
                    0,
                );

                tracing::debug!("submitting input transfer: {:?}", input.transfer);
                libusb_submit_transfer(input.transfer.as_raw());
                self.pending_transfers.push(input.transfer);
            }
        }

        let (quit_tx, quit_rx) = mpsc::channel();
        let ctx = self.device_handle.context().clone();
        self.handle_events_thread = Some((
            thread::spawn(move || {
                let _entered =
                    tracing::span!(tracing::Level::TRACE, "handle_events_thread").entered();
                loop {
                    if quit_rx.try_recv().is_ok() {
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
            for pending_transfer in &self.pending_transfers {
                tracing::debug!("cancelling pending transfer: {pending_transfer:?}");
                unsafe { libusb_cancel_transfer(pending_transfer.as_raw()) };
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
        let command = Command::new(data);
        let bytes = command.to_bytes();
        let transfer = Transfer::bulk(bytes);

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
                    tracing::debug!("transfer completed on OUT endpoint");
                }
                endpoint if self.inputs.iter().any(|input| input.endpoint == endpoint) => {
                    tracing::debug!("transfer completed on IN endpoint");

                    #[allow(clippy::cast_sign_loss)]
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
                    tracing::warn!("transfer completed on unknown endpoint: {endpoint:02x}");
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
    transfer: Transfer,
}

impl Input {
    pub fn new(endpoint: u8) -> Self {
        Self {
            endpoint,
            transfer: Transfer::bulk(),
        }
    }
}
