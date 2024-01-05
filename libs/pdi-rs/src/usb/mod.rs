use std::{ffi::c_void, fmt, mem, sync::mpsc};

type LibusbContext = *mut c_void;
type LibusbDeviceHandle = *mut c_void;
type LibusbTransferCallback = extern "C" fn(transfer: *mut LibusbTransfer);

#[derive(Debug)]
#[repr(C)]
enum libusb_transfer_status {
    /** Transfer completed without error. Note that this does not indicate
     * that the entire amount of requested data was transferred. */
    LIBUSB_TRANSFER_COMPLETED,

    /** Transfer failed */
    LIBUSB_TRANSFER_ERROR,

    /** Transfer timed out */
    LIBUSB_TRANSFER_TIMED_OUT,

    /** Transfer was cancelled */
    LIBUSB_TRANSFER_CANCELLED,

    /** For bulk/interrupt endpoints: halt condition detected (endpoint
     * stalled). For control endpoints: control request not supported. */
    LIBUSB_TRANSFER_STALL,

    /** Device was disconnected */
    LIBUSB_TRANSFER_NO_DEVICE,

    /** Device sent more data than requested */
    LIBUSB_TRANSFER_OVERFLOW, /* NB! Remember to update libusb_error_name()
                              when adding new status codes here. */
}

/// Transfer type
#[derive(Debug)]
#[repr(u8)]
enum libusb_transfer_type {
    /** Control transfer */
    LIBUSB_TRANSFER_TYPE_CONTROL = 0,

    /** Isochronous transfer */
    LIBUSB_TRANSFER_TYPE_ISOCHRONOUS = 1,

    /** Bulk transfer */
    LIBUSB_TRANSFER_TYPE_BULK = 2,

    /** Interrupt transfer */
    LIBUSB_TRANSFER_TYPE_INTERRUPT = 3,

    /** Bulk stream transfer */
    LIBUSB_TRANSFER_TYPE_BULK_STREAM = 4,
}

#[derive(Debug)]
struct LibusbTransfer {
    /// Handle of the device that this transfer will be submitted to
    dev_handle: LibusbDeviceHandle,

    /// A bitwise OR combination of \ref libusb_transfer_flags.
    flags: u8,

    /// Address of the endpoint where this transfer will be sent.
    endpoint: u8,

    /// Type of the transfer from \ref libusb_transfer_type
    r#type: libusb_transfer_type,

    /// Timeout for this transfer in milliseconds. A value of 0 indicates no
    /// timeout.
    timeout: u32,

    /// The status of the transfer. Read-only, and only for use within
    /// transfer callback function.
    ///
    /// If this is an isochronous transfer, this field may read COMPLETED even
    /// if there were errors in the frames. Use the
    /// \ref libusb_iso_packet_descriptor::status "status" field in each packet
    /// to determine if errors occurred.
    status: libusb_transfer_status,

    /// Length of the data buffer. Must be non-negative.
    length: i32,

    /// Actual length of data that was transferred. Read-only, and only for
    /// use within transfer callback function. Not valid for isochronous
    /// endpoint transfers.
    actual_length: i32,

    /// Callback function. This will be invoked when the transfer completes,
    /// fails, or is cancelled.
    callback: LibusbTransferCallback,

    /// User context data. Useful for associating specific data to a transfer
    /// that can be accessed from within the callback function.
    ///
    /// This field may be set manually or is taken as the `user_data` parameter
    /// of the following functions:
    /// - libusb_fill_bulk_transfer()
    /// - libusb_fill_bulk_stream_transfer()
    /// - libusb_fill_control_transfer()
    /// - libusb_fill_interrupt_transfer()
    /// - libusb_fill_iso_transfer()
    user_data: *mut c_void,

    /// Data buffer
    buffer: *mut u8,

    /// Number of isochronous packets. Only used for I/O with isochronous
    /// endpoints. Must be non-negative.
    num_iso_packets: i32,

    /// Isochronous packet descriptors, for isochronous transfers only.
    iso_packet_desc: [LibusbIsoPacketDescriptor; 0],
}

#[derive(Debug)]
struct LibusbIsoPacketDescriptor {
    /// Length of data to request in this packet
    length: u32,

    /// Amount of data that was actually transferred
    actual_length: u32,

    /// Status code for this packet
    status: libusb_transfer_status,
}

macro_rules! try_libusb {
    ($expr:expr) => {
        match unsafe { $expr } {
            0 => Ok(()), // Success
            err => Err(Error::Libusb(
                LibusbError::try_from(err as i32).unwrap_or(LibusbError::ErrorOther),
            )),
        }
    };
}

#[derive(Clone, Copy)]
pub enum Endpoint {
    In(u8),
    Out(u8),
}

impl Endpoint {
    pub fn from_number(number: u8) -> Self {
        if number & 0x80 != 0 {
            Self::In(number & 0x7f)
        } else {
            Self::Out(number)
        }
    }

    fn address(&self) -> u8 {
        match self {
            Endpoint::In(addr) => addr | 0x80,
            Endpoint::Out(addr) => *addr,
        }
    }
}

impl fmt::Debug for Endpoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let address = self.address();
        match self {
            Endpoint::In(number) => write!(f, "Endpoint::In(number={number}, address={address})"),
            Endpoint::Out(number) => write!(f, "Endpoint::Out(number={number}, address={address})"),
        }
    }
}

#[derive(Debug)]
pub struct Context {
    context: LibusbContext,
}

impl Context {
    pub fn new() -> Result<Self, Error> {
        // just use the default context for now
        let mut context = std::ptr::null_mut();
        try_libusb! { libusb_init(&mut context) }?;
        Ok(Self { context })
    }

    pub fn open_device(&self, vendor_id: u16, product_id: u16) -> Result<Device, Error> {
        let handle =
            unsafe { libusb_open_device_with_vid_pid(self.context, vendor_id, product_id) };
        if handle.is_null() {
            Err(Error::Libusb(LibusbError::ErrorNoDevice))
        } else {
            Ok(Device { handle })
        }
    }

    pub fn handle_events(&self) -> Result<(), Error> {
        try_libusb! { libusb_handle_events(self.context) }
    }
}

impl Drop for Context {
    fn drop(&mut self) {
        unsafe { libusb_exit(self.context) };
    }
}

#[derive(Debug)]
pub struct Device {
    handle: LibusbDeviceHandle,
}

impl Device {
    pub fn bulk_transfer_out(
        &self,
        endpoint: Endpoint,
        data: &[u8],
        timeout: std::time::Duration,
    ) -> Result<usize, Error> {
        if let Endpoint::In(_) = endpoint {
            return Err(Error::Libusb(LibusbError::ErrorInvalidParam));
        }

        let mut transferred = 0;
        try_libusb! {
            libusb_bulk_transfer(
                self.handle,
                endpoint.address(),
                data.as_ptr() as *mut u8,
                data.len() as i32,
                &mut transferred,
                timeout.as_millis() as u32,
            )
        }?;
        Ok(transferred as usize)
    }

    pub fn bulk_transfer_in(
        &self,
        endpoint: Endpoint,
        data: &mut [u8],
        timeout: std::time::Duration,
    ) -> Result<usize, Error> {
        if let Endpoint::Out(_) = endpoint {
            return Err(Error::Libusb(LibusbError::ErrorInvalidParam));
        }

        let mut transferred = 0;
        try_libusb! {
            libusb_bulk_transfer(
                self.handle,
                endpoint.address(),
                data.as_mut_ptr(),
                data.len() as i32,
                &mut transferred,
                timeout.as_millis() as u32,
            )
        }?;
        Ok(transferred as usize)
    }

    pub fn async_bulk_transfer_out(
        &self,
        endpoint: Endpoint,
        data: &[u8],
        timeout: std::time::Duration,
    ) -> Result<(), Error> {
        // TODO: handle deallocating transfer
        let mut transfer = TransferHandle::try_new()?;
        println!("async_bulk_transfer_out: created transfer: {:?}", transfer);

        // create callback function for C
        extern "C" fn transfer_callback(transfer: *mut LibusbTransfer) {
            let transfer = unsafe { Box::from_raw(transfer) };
            println!("async_bulk_transfer_out: transfer_callback: {:?}", transfer);
            mem::forget(transfer);
        }

        let mut buffer = vec![0; 4096];
        buffer[..data.len()].copy_from_slice(data);
        transfer.fill_bulk_transfer(
            self.handle,
            endpoint.address(),
            buffer.as_mut_ptr(),
            data.len() as i32,
            transfer_callback,
            std::ptr::null_mut(),
            timeout.as_millis() as u32,
        );

        println!("async_bulk_transfer_out: sending transfer: {transfer:?}");
        try_libusb! { libusb_submit_transfer(transfer.handle) }?;
        println!(
            "async_bulk_transfer_out: submitted transfer: {:?}",
            transfer
        );

        Ok(())
    }

    pub fn async_create_bulk_transfer_in_channel(
        &self,
        endpoint: Endpoint,
        timeout: std::time::Duration,
    ) -> Result<mpsc::Receiver<(Endpoint, Vec<u8>)>, Error> {
        if let Endpoint::Out(_) = endpoint {
            return Err(Error::Libusb(LibusbError::ErrorInvalidParam));
        }

        let (tx, rx) = mpsc::channel();
        let mut transfer = TransferHandle::try_new()?;

        // create callback function for C
        extern "C" fn transfer_callback(transfer: *mut LibusbTransfer) {
            let transfer = unsafe { Box::from_raw(transfer) };
            println!("transfer_callback: {:?}", transfer);
            mem::forget(transfer);
        }

        let mut buffer = vec![0; 4096];
        transfer.fill_bulk_transfer(
            self.handle,
            endpoint.address(),
            buffer.as_mut_ptr(),
            buffer.len() as i32,
            transfer_callback,
            Box::into_raw(Box::new((tx, buffer))) as *mut c_void,
            timeout.as_millis() as u32,
        );

        try_libusb! { libusb_submit_transfer(transfer.handle) }?;

        Ok(rx)
    }
}

impl Drop for Device {
    fn drop(&mut self) {
        unsafe { libusb_close(self.handle) };
    }
}

pub struct TransferHandle {
    handle: *mut LibusbTransfer,
}

impl TransferHandle {
    fn try_new() -> Result<Self, Error> {
        let handle = unsafe { libusb_alloc_transfer(0) };
        if handle.is_null() {
            Err(Error::Libusb(LibusbError::ErrorNoMem))
        } else {
            Ok(Self { handle })
        }
    }

    fn fill_bulk_transfer(
        &mut self,
        dev_handle: LibusbDeviceHandle,
        endpoint: u8,
        buffer: *mut u8,
        length: i32,
        callback: LibusbTransferCallback,
        user_data: *mut c_void,
        timeout: u32,
    ) {
        let handle: &mut LibusbTransfer = unsafe { mem::transmute(self.handle) };
        handle.dev_handle = dev_handle;
        handle.endpoint = endpoint;
        handle.r#type = libusb_transfer_type::LIBUSB_TRANSFER_TYPE_BULK;
        handle.timeout = timeout;
        handle.buffer = buffer;
        handle.length = length;
        handle.user_data = user_data;
        handle.callback = callback;
    }
}

impl fmt::Debug for TransferHandle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let handle: &mut LibusbTransfer = unsafe { mem::transmute(self.handle) };
        write!(f, "TransferHandle({:?})", handle)
    }
}

impl Drop for TransferHandle {
    fn drop(&mut self) {
        // unsafe { libusb_free_transfer(self.handle) };
    }
}

#[derive(Debug)]
pub struct TransferIn {
    handle: TransferHandle,
    endpoint: Endpoint,
    buffer: Vec<u8>,
}

impl TransferIn {
    fn try_new(endpoint: Endpoint) -> Result<Self, Error> {
        if let Endpoint::Out(_) = endpoint {
            return Err(Error::Libusb(LibusbError::ErrorInvalidParam));
        }

        let handle = TransferHandle::try_new()?;
        let buffer = vec![0; 4096];
        Ok(Self {
            handle,
            endpoint,
            buffer,
        })
    }
}

#[derive(Debug)]
pub struct TransferOut<'a> {
    handle: TransferHandle,
    endpoint: Endpoint,
    buffer: &'a [u8],
}

impl<'a> TransferOut<'a> {
    fn try_new(endpoint: Endpoint, buffer: &'a [u8]) -> Result<Self, Error> {
        if let Endpoint::In(_) = endpoint {
            return Err(Error::Libusb(LibusbError::ErrorInvalidParam));
        }

        let handle = TransferHandle::try_new()?;
        Ok(Self {
            handle,
            endpoint,
            buffer,
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(std::io::Error),
    #[error("libusb error: {0}")]
    Libusb(LibusbError),
}

#[derive(Debug)]
#[repr(C)]
pub enum LibusbError {
    /// Success (no error)
    Success = 0,

    /// Input/output error
    ErrorIo = -1,

    /// Invalid parameter
    ErrorInvalidParam = -2,

    /// Access denied (insufficient permissions)
    ErrorAccess = -3,

    /// No such device (it may have been disconnected)
    ErrorNoDevice = -4,

    /// Entity not found
    ErrorNotFound = -5,

    /// Resource busy
    ErrorBusy = -6,

    /// Operation timed out
    ErrorTimeout = -7,

    /// Overflow
    ErrorOverflow = -8,

    /// Pipe error
    ErrorPipe = -9,

    /// System call interrupted (perhaps due to signal)
    ErrorInterrupted = -10,

    /// Insufficient memory
    ErrorNoMem = -11,

    /// Operation not supported or unimplemented on this platform
    ErrorNotSupported = -12,

    /// Other error
    ErrorOther = -99,
}

impl TryFrom<i32> for LibusbError {
    type Error = ();

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(LibusbError::Success),
            -1 => Ok(LibusbError::ErrorIo),
            -2 => Ok(LibusbError::ErrorInvalidParam),
            -3 => Ok(LibusbError::ErrorAccess),
            -4 => Ok(LibusbError::ErrorNoDevice),
            -5 => Ok(LibusbError::ErrorNotFound),
            -6 => Ok(LibusbError::ErrorBusy),
            -7 => Ok(LibusbError::ErrorTimeout),
            -8 => Ok(LibusbError::ErrorOverflow),
            -9 => Ok(LibusbError::ErrorPipe),
            -10 => Ok(LibusbError::ErrorInterrupted),
            -11 => Ok(LibusbError::ErrorNoMem),
            -12 => Ok(LibusbError::ErrorNotSupported),
            -99 => Ok(LibusbError::ErrorOther),
            _ => Err(()),
        }
    }
}

impl fmt::Display for LibusbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            LibusbError::Success => "Success (no error)",
            LibusbError::ErrorIo => "Input/output error",
            LibusbError::ErrorInvalidParam => "Invalid parameter",
            LibusbError::ErrorAccess => "Access denied (insufficient permissions)",
            LibusbError::ErrorNoDevice => "No such device (it may have been disconnected)",
            LibusbError::ErrorNotFound => "Entity not found",
            LibusbError::ErrorBusy => "Resource busy",
            LibusbError::ErrorTimeout => "Operation timed out",
            LibusbError::ErrorOverflow => "Overflow",
            LibusbError::ErrorPipe => "Pipe error",
            LibusbError::ErrorInterrupted => "System call interrupted (perhaps due to signal)",
            LibusbError::ErrorNoMem => "Insufficient memory",
            LibusbError::ErrorNotSupported => {
                "Operation not supported or unimplemented on this platform"
            }
            LibusbError::ErrorOther => "Other error",
        };
        write!(f, "{}", message)
    }
}

#[link(name = "usb-1.0")]
extern "C" {
    /// Initialize libusb. This function must be called before calling any other
    /// libusb function.
    ///
    /// If you do not provide an output location for a context pointer, a default
    /// context will be created. If there was already a default context, it will
    /// be reused (and nothing will be initialized/reinitialized).
    ///
    /// # Arguments
    ///
    /// * `ctx` - Optional output location for context pointer. Only valid on return code 0.
    ///
    /// # Return value
    ///
    /// 0 on success, or a LibusbError code on failure
    fn libusb_init(ctx: *mut LibusbContext) -> i32;

    /// Deinitialize libusb. Should be called after closing all open devices and
    /// before your application terminates.
    ///
    /// # Arguments
    ///
    /// * `ctx` - the context to deinitialize, or NULL for the default context.
    fn libusb_exit(ctx: LibusbContext);

    /// Convenience function for finding a device with a particular
    /// `idVendor`/`idProduct` combination. This function is intended
    /// for those scenarios where you are using libusb to knock up a quick test
    /// application - it allows you to avoid calling libusb_get_device_list() and
    /// worrying about traversing/freeing the list.
    ///
    /// This function has limitations and is hence not intended for use in real
    /// applications: if multiple devices have the same IDs it will only
    /// give you the first one, etc.
    ///
    /// # Arguments
    ///
    /// - `ctx` - the context to operate on, or NULL for the default context
    /// - `vendor_id` - the idVendor value to search for
    /// - `product_id` - the idProduct value to search for
    ///
    /// # Return value
    /// A device handle for the first found device, or NULL on error
    /// or if the device could not be found.
    fn libusb_open_device_with_vid_pid(
        ctx: LibusbContext,
        vendor_id: u16,
        product_id: u16,
    ) -> LibusbDeviceHandle;

    /// Close a device handle. Should be called on all open handles before your
    /// application exits.
    ///
    /// Internally, this function destroys the reference that was added by
    /// libusb_open() on the given device.
    ///
    /// This is a non-blocking function; no requests are sent over the bus.
    ///
    /// # Arguments
    ///
    /// * `dev_handle` - the device handle to close
    fn libusb_close(dev_handle: LibusbDeviceHandle);

    /// Perform a USB bulk transfer. The direction of the transfer is inferred from
    /// the direction bits of the endpoint address.
    ///
    /// For bulk reads, the <tt>length</tt> field indicates the maximum length of
    /// data you are expecting to receive. If less data arrives than expected,
    /// this function will return that data, so be sure to check the
    /// <tt>transferred</tt> output parameter.
    ///
    /// You should also check the <tt>transferred</tt> parameter for bulk writes.
    /// Not all of the data may have been written.
    ///
    /// Also check <tt>transferred</tt> when dealing with a timeout error code.
    /// libusb may have to split your transfer into a number of chunks to satisfy
    /// underlying O/S requirements, meaning that the timeout may expire after
    /// the first few chunks have completed. libusb is careful not to lose any data
    /// that may have been transferred; do not assume that timeout conditions
    /// indicate a complete lack of I/O. See \ref asynctimeout for more details.
    ///
    /// # Arguments
    ///
    /// * `dev_handle` - a handle for the device to communicate with
    /// * `endpoint` - the address of a valid endpoint to communicate with
    /// * `data` - a suitably-sized data buffer for either input or output
    /// (depending on endpoint)
    /// * `length` - for bulk writes, the number of bytes from data to be sent. for
    /// bulk reads, the maximum number of bytes to receive into the data buffer.
    /// * `transferred` - output location for the number of bytes actually
    /// transferred. Since version 1.0.21 (\ref LIBUSB_API_VERSION >= 0x01000105),
    /// it is legal to pass a NULL pointer if you do not wish to receive this
    /// information.
    /// * `timeout` - timeout (in milliseconds) that this function should wait
    /// before giving up due to no response being received. For an unlimited
    /// timeout, use value 0.
    ///
    /// # Return value
    ///
    /// * 0 on success (and populates `transferred`)
    /// * `LIBUSB_ERROR_TIMEOUT` if the transfer timed out (and populates
    /// `transferred`)
    /// * `LIBUSB_ERROR_PIPE` if the endpoint halted
    /// * `LIBUSB_ERROR_OVERFLOW` if the device offered more data
    /// * `LIBUSB_ERROR_NO_DEVICE` if the device has been disconnected
    /// * `LIBUSB_ERROR_BUSY` if called from event handling context
    /// * `LIBUSB_ERROR_INVALID_PARAM` if the transfer size is larger than
    ///   the operating system and/or hardware can support
    /// * another `LIBUSB_ERROR` code on other failures
    fn libusb_bulk_transfer(
        dev_handle: LibusbDeviceHandle,
        endpoint: u8,
        data: *mut u8,
        length: i32,
        transferred: *mut i32,
        timeout: u32,
    ) -> i32;

    /// Allocate a libusb transfer with a specified number of isochronous packet
    /// descriptors. The returned transfer is pre-initialized for you. When the new
    /// transfer is no longer needed, it should be freed with
    /// libusb_free_transfer().
    ///
    /// Transfers intended for non-isochronous endpoints (e.g. control, bulk,
    /// interrupt) should specify an iso_packets count of zero.
    ///
    /// For transfers intended for isochronous endpoints, specify an appropriate
    /// number of packet descriptors to be allocated as part of the transfer.
    /// The returned transfer is not specially initialized for isochronous I/O;
    /// you are still required to set the
    /// \ref libusb_transfer::num_iso_packets "num_iso_packets" and
    /// \ref libusb_transfer::type "type" fields accordingly.
    ///
    /// It is safe to allocate a transfer with some isochronous packets and then
    /// use it on a non-isochronous endpoint. If you do this, ensure that at time
    /// of submission, num_iso_packets is 0 and that type is set appropriately.
    ///
    /// # Arguments
    ///
    /// * `iso_packets` - number of isochronous packet descriptors to allocate. Must be non-negative.
    ///
    /// # Return value
    ///
    /// Returns a newly allocated transfer, or NULL on error
    fn libusb_alloc_transfer(iso_packets: i32) -> *mut LibusbTransfer;

    /// Free a transfer structure. This should be called for all transfers
    /// allocated with libusb_alloc_transfer().
    ///
    /// If the \ref libusb_transfer_flags::LIBUSB_TRANSFER_FREE_BUFFER
    /// "LIBUSB_TRANSFER_FREE_BUFFER" flag is set and the transfer buffer is
    /// non-NULL, this function will also free the transfer buffer using the
    /// standard system memory allocator (e.g. free()).
    ///
    /// It is legal to call this function with a NULL transfer. In this case,
    /// the function will simply return safely.
    ///
    /// It is not legal to free an active transfer (one which has been submitted
    /// and has not yet completed).
    ///
    /// # Arguments
    ///
    /// - `transfer` - the transfer to free
    fn libusb_free_transfer(transfer: *mut LibusbTransfer);

    /// Submit a transfer. This function will fire off the USB transfer and then
    /// return immediately.
    ///
    /// # Arguments
    ///
    /// * `transfer` - the transfer to submit
    ///
    /// # Return value
    ///
    /// * 0 on success
    /// * `LIBUSB_ERROR_NO_DEVICE` if the device has been disconnected
    /// * `LIBUSB_ERROR_BUSY` if the transfer has already been submitted.
    /// * `LIBUSB_ERROR_NOT_SUPPORTED` if the transfer flags are not supported
    /// by the operating system.
    /// * `LIBUSB_ERROR_INVALID_PARAM` if the transfer size is larger than
    /// the operating system and/or hardware can support
    /// * another `LIBUSB_ERROR` code on other failure
    fn libusb_submit_transfer(transfer: *mut LibusbTransfer) -> i32;

    /// Handle any pending events in blocking mode. There is currently a timeout
    /// hard-coded at 60 seconds but we plan to make it unlimited in future. For
    /// finer control over whether this function is blocking or non-blocking, or
    /// for control over the timeout, use libusb_handle_events_timeout_completed()
    /// instead.
    ///
    /// This function is kept primarily for backwards compatibility.
    /// All new code should call libusb_handle_events_completed() or
    /// libusb_handle_events_timeout_completed() to avoid race conditions.
    ///
    /// # Arguments
    ///
    /// * `ctx` - the context to operate on, or NULL for the default context
    ///
    /// # Return value
    ///
    /// 0 on success, or a LIBUSB_ERROR code on failure
    fn libusb_handle_events(ctx: LibusbContext) -> i32;

    /// Handle any pending events in blocking mode.
    ///
    /// Like libusb_handle_events(), with the addition of a completed parameter
    /// to allow for race free waiting for the completion of a specific transfer.
    ///
    /// See libusb_handle_events_timeout_completed() for details on the completed
    /// parameter.
    ///
    /// # Arguments
    ///
    /// * `ctx` - the context to operate on, or NULL for the default context
    /// * `completed` - pointer to completion integer to check, or NULL
    ///
    /// # Return value
    ///
    /// 0 on success, or a LIBUSB_ERROR code on failure
    fn libusb_handle_events_completed(ctx: LibusbContext, completed: *mut i32) -> i32;
}
