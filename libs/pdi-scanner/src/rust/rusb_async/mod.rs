// File originally copied from https://github.com/a1ien/rusb/commit/4d955e48394e2a5c116fd4e3c9408c88536ed894,
// with the license:
//
//     Copyright (c) 2015 David Cuddeback
//                   2019 Ilya Averyanov
//
//     Permission is hereby granted, free of charge, to any person obtaining
//     a copy of this software and associated documentation files (the
//     "Software"), to deal in the Software without restriction, including
//     without limitation the rights to use, copy, modify, merge, publish,
//     distribute, sublicense, and/or sell copies of the Software, and to
//     permit persons to whom the Software is furnished to do so, subject to
//     the following conditions:
//
//     The above copyright notice and this permission notice shall be
//     included in all copies or substantial portions of the Software.
//
//     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//     EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
//     MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
//     NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
//     LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
//     OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
//     WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// Modifications have been made to better support the use case of this project.

use rusb::ffi;

use std::convert::TryInto;
use std::ptr::NonNull;

use std::sync::atomic::{AtomicBool, Ordering};

mod error;
mod pool;

pub use error::{Error, Result};
pub use pool::TransferPool;

struct Transfer {
    ptr: NonNull<ffi::libusb_transfer>,
    buffer: Vec<u8>,
}

impl Transfer {
    // Invariant: Caller must ensure `device` outlives this transfer
    #[allow(unused)]
    unsafe fn bulk(
        device: *mut ffi::libusb_device_handle,
        endpoint: u8,
        mut buffer: Vec<u8>,
    ) -> Self {
        // non-isochronous endpoints (e.g. control, bulk, interrupt) specify a value of 0
        // This is step 1 of async API

        let ptr =
            NonNull::new(ffi::libusb_alloc_transfer(0)).expect("Could not allocate transfer!");

        let user_data = Box::into_raw(Box::new(AtomicBool::new(false))).cast::<libc::c_void>();

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

        ffi::libusb_fill_bulk_transfer(
            ptr.as_ptr(),
            device,
            endpoint,
            buffer.as_mut_ptr(),
            length,
            Self::transfer_cb,
            user_data,
            0,
        );

        Self { ptr, buffer }
    }

    // Invariant: Caller must ensure `device` outlives this transfer
    #[allow(unused)]
    unsafe fn control(
        device: *mut ffi::libusb_device_handle,

        request_type: u8,
        request: u8,
        value: u16,
        index: u16,
        data: &[u8],
    ) -> Self {
        let mut buf = Vec::with_capacity(data.len() + ffi::constants::LIBUSB_CONTROL_SETUP_SIZE);

        let length = data.len() as u16;

        ffi::libusb_fill_control_setup(
            buf.as_mut_ptr(),
            request_type,
            request,
            value,
            index,
            length,
        );
        Self::control_raw(device, buf)
    }

    // Invariant: Caller must ensure `device` outlives this transfer
    #[allow(unused)]
    unsafe fn control_raw(device: *mut ffi::libusb_device_handle, mut buffer: Vec<u8>) -> Self {
        // non-isochronous endpoints (e.g. control, bulk, interrupt) specify a value of 0
        // This is step 1 of async API

        let ptr =
            NonNull::new(ffi::libusb_alloc_transfer(0)).expect("Could not allocate transfer!");

        let user_data = Box::into_raw(Box::new(AtomicBool::new(false))).cast::<libc::c_void>();

        ffi::libusb_fill_control_transfer(
            ptr.as_ptr(),
            device,
            buffer.as_mut_ptr(),
            Self::transfer_cb,
            user_data,
            0,
        );

        Self { ptr, buffer }
    }

    // Invariant: Caller must ensure `device` outlives this transfer
    #[allow(unused)]
    unsafe fn interrupt(
        device: *mut ffi::libusb_device_handle,
        endpoint: u8,
        mut buffer: Vec<u8>,
    ) -> Self {
        // non-isochronous endpoints (e.g. control, bulk, interrupt) specify a value of 0
        // This is step 1 of async API

        let ptr =
            NonNull::new(ffi::libusb_alloc_transfer(0)).expect("Could not allocate transfer!");

        let user_data = Box::into_raw(Box::new(AtomicBool::new(false))).cast::<libc::c_void>();

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

        ffi::libusb_fill_interrupt_transfer(
            ptr.as_ptr(),
            device,
            endpoint,
            buffer.as_mut_ptr(),
            length,
            Self::transfer_cb,
            user_data,
            0,
        );

        Self { ptr, buffer }
    }

    // Invariant: Caller must ensure `device` outlives this transfer
    #[allow(unused)]
    unsafe fn iso(
        device: *mut ffi::libusb_device_handle,
        endpoint: u8,
        mut buffer: Vec<u8>,
        iso_packets: i32,
    ) -> Self {
        // isochronous endpoints
        // This is step 1 of async API
        let ptr = NonNull::new(ffi::libusb_alloc_transfer(iso_packets))
            .expect("Could not allocate transfer!");

        let user_data = Box::into_raw(Box::new(AtomicBool::new(false))).cast::<libc::c_void>();

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

        ffi::libusb_fill_iso_transfer(
            ptr.as_ptr(),
            device,
            endpoint,
            buffer.as_mut_ptr(),
            length,
            iso_packets,
            Self::transfer_cb,
            user_data,
            0,
        );
        ffi::libusb_set_iso_packet_lengths(ptr.as_ptr(), (length / iso_packets) as u32);

        Self { ptr, buffer }
    }

    // Part of step 4 of async API the transfer is finished being handled when
    // `poll()` is called.
    extern "system" fn transfer_cb(transfer: *mut ffi::libusb_transfer) {
        // Safety: transfer is still valid because libusb just completed
        // it but we haven't told anyone yet. user_data remains valid
        // because it is freed only with the transfer.
        // After the store to completed, these may no longer be valid if
        // the polling thread freed it after seeing it completed.
        let completed = unsafe {
            let transfer = &mut *transfer;
            &*transfer.user_data.cast::<AtomicBool>()
        };
        completed.store(true, Ordering::SeqCst);
    }

    fn transfer(&self) -> &ffi::libusb_transfer {
        // Safety: transfer remains valid as long as self
        unsafe { self.ptr.as_ref() }
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
            ffi::constants::LIBUSB_ERROR_NO_DEVICE => Err(Error::Disconnected),
            ffi::constants::LIBUSB_ERROR_BUSY => {
                unreachable!("We shouldn't be calling submit on transfers already submitted!")
            }
            ffi::constants::LIBUSB_ERROR_NOT_SUPPORTED => {
                Err(Error::Other("Transfer not supported"))
            }
            ffi::constants::LIBUSB_ERROR_INVALID_PARAM => {
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

    fn handle_completed(&mut self) -> Result<Vec<u8>> {
        assert!(self.completed_flag().load(Ordering::Relaxed));
        let err = match self.transfer().status {
            ffi::constants::LIBUSB_TRANSFER_COMPLETED => {
                debug_assert!(self.transfer().length >= self.transfer().actual_length);
                unsafe {
                    self.buffer.set_len(self.transfer().actual_length as usize);
                }
                let data = self.swap_buffer(Vec::new());
                return Ok(data);
            }
            ffi::constants::LIBUSB_TRANSFER_CANCELLED => Error::Cancelled,
            ffi::constants::LIBUSB_TRANSFER_ERROR => Error::TransferError,
            ffi::constants::LIBUSB_TRANSFER_TIMED_OUT => {
                unreachable!("We are using timeout=0 which means no timeout")
            }
            ffi::constants::LIBUSB_TRANSFER_STALL => Error::Stall,
            ffi::constants::LIBUSB_TRANSFER_NO_DEVICE => Error::Disconnected,
            ffi::constants::LIBUSB_TRANSFER_OVERFLOW => Error::Overflow,
            _ => panic!("Found an unexpected error value for transfer status"),
        };
        Err(err)
    }
}

/// Invariant: transfer must not be pending
impl Drop for Transfer {
    fn drop(&mut self) {
        unsafe {
            drop(Box::from_raw(
                self.transfer().user_data.cast::<AtomicBool>(),
            ));
            ffi::libusb_free_transfer(self.ptr.as_ptr());
        }
    }
}
