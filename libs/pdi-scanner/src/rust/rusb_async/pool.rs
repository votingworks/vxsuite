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

use std::collections::VecDeque;
use std::ptr::addr_of;
use std::sync::Arc;
use std::time::{Duration, Instant};

use rusb::{ffi, DeviceHandle, UsbContext};

use super::{error::Error, error::Result, Transfer};

use std::sync::atomic::{AtomicBool, Ordering};

/// Represents a pool of asynchronous transfers, that can be polled to completion
pub struct TransferPool<C: UsbContext> {
    device: Arc<DeviceHandle<C>>,
    pending: VecDeque<Transfer>,
}

impl<C: UsbContext> TransferPool<C> {
    pub fn new(device: Arc<DeviceHandle<C>>) -> Self {
        Self {
            device,
            pending: VecDeque::new(),
        }
    }

    #[allow(unused)]
    pub fn submit_bulk(&mut self, endpoint: u8, buf: Vec<u8>) -> Result<()> {
        // Safety: If transfer is submitted, it is pushed onto `pending` where it will be
        // dropped before `device` is freed.
        unsafe {
            let mut transfer = Transfer::bulk(self.device.as_raw(), endpoint, buf);
            transfer.submit()?;
            self.pending.push_back(transfer);
            Ok(())
        }
    }

    #[allow(unused)]
    pub fn submit_control(
        &mut self,
        request_type: u8,
        request: u8,
        value: u16,
        index: u16,
        data: &[u8],
    ) -> Result<()> {
        // Safety: If transfer is submitted, it is pushed onto `pending` where it will be
        // dropped before `device` is freed.
        unsafe {
            let mut transfer = Transfer::control(
                self.device.as_raw(),
                request_type,
                request,
                value,
                index,
                data,
            );
            transfer.submit()?;
            self.pending.push_back(transfer);
            Ok(())
        }
    }

    #[allow(unused)]
    pub fn submit_interrupt(&mut self, endpoint: u8, buf: Vec<u8>) -> Result<()> {
        // Safety: If transfer is submitted, it is pushed onto `pending` where it will be
        // dropped before `device` is freed.
        unsafe {
            let mut transfer = Transfer::interrupt(self.device.as_raw(), endpoint, buf);
            transfer.submit()?;
            self.pending.push_back(transfer);
            Ok(())
        }
    }

    #[allow(unused)]
    pub fn submit_iso(&mut self, endpoint: u8, buf: Vec<u8>, iso_packets: i32) -> Result<()> {
        // Safety: If transfer is submitted, it is pushed onto `pending` where it will be
        // dropped before `device` is freed.
        unsafe {
            let mut transfer = Transfer::iso(self.device.as_raw(), endpoint, buf, iso_packets);
            transfer.submit()?;
            self.pending.push_back(transfer);
            Ok(())
        }
    }

    pub fn poll(&mut self, timeout: Duration) -> Result<CompletedTransfer> {
        let next = self.pending.front().ok_or(Error::NoTransfersPending)?;
        if poll_completed(self.device.context(), timeout, next.completed_flag()) {
            let mut transfer = self.pending.pop_front().unwrap();
            let endpoint = transfer.transfer().endpoint;
            let data = transfer.handle_completed()?;
            Ok(CompletedTransfer::new(endpoint, data))
        } else {
            Err(Error::PollTimeout)
        }
    }

    pub fn poll_endpoint(&mut self, endpoint: u8, timeout: Duration) -> Result<Vec<u8>> {
        // We look for the first pending transfer that matches `endpoint`. Once
        // we find it, we poll it to completion or timeout, and then return the
        // data. However, we need to remove the transfer from `pending` in a
        // safe way (i.e. not while iterating over it). We do this by creating a
        // new `VecDeque` and moving all transfers that are not the one we are
        // looking for into it. This means we cannot return early or exit the
        // loop early, as we need to process all transfers to ensure they are
        // all moved to the new `VecDeque`.

        let mut new_pending = VecDeque::new();
        let mut result: Option<Result<Vec<u8>>> = None;

        for mut transfer in self.pending.drain(..) {
            // Only look for a matching transfer if we haven't already found one
            // and determined it is completed or timed out.
            if result.is_none() && transfer.transfer().endpoint == endpoint {
                if poll_completed(self.device.context(), timeout, transfer.completed_flag()) {
                    result = Some(transfer.handle_completed());

                    // Skip adding the transfer to the new `VecDeque` as we have
                    // already handled it.
                    continue;
                }

                // If the transfer timed out, we need to return an error. We
                // cannot return early, as we need to process all transfers to
                // ensure they are all moved to the new `VecDeque`.
                result = Some(Err(Error::PollTimeout));
            }

            // Add all transfers that are not the one we are looking for to the
            // new `VecDeque`.
            new_pending.push_back(transfer);
        }

        assert!(self.pending.is_empty(), "All transfers should be moved");
        self.pending = new_pending;
        result.unwrap_or(Err(Error::NoTransfersPending))
    }

    pub fn cancel_all(&mut self) {
        // Cancel in reverse order to avoid a race condition in which one
        // transfer is cancelled but another submitted later makes its way onto
        // the bus.
        for transfer in self.pending.iter_mut().rev() {
            transfer.cancel();
        }
    }

    /// Returns the number of async transfers pending
    pub fn pending(&self) -> usize {
        self.pending.len()
    }
}

unsafe impl<C: UsbContext> Send for TransferPool<C> {}
// unsafe impl<C: UsbContext> Sync for TransferPool<C> {}

impl<C: UsbContext> Drop for TransferPool<C> {
    fn drop(&mut self) {
        self.cancel_all();
        while self.pending() > 0 {
            self.poll(Duration::from_secs(1)).ok();
        }
    }
}

#[allow(unused)]
pub struct CompletedTransfer {
    endpoint: u8,
    data: Vec<u8>,
}

impl CompletedTransfer {
    const fn new(endpoint: u8, data: Vec<u8>) -> Self {
        Self { endpoint, data }
    }

    #[allow(unused)]
    pub const fn endpoint(&self) -> u8 {
        self.endpoint
    }

    #[allow(unused)]
    pub const fn data(&self) -> &Vec<u8> {
        &self.data
    }

    #[allow(unused)]
    pub fn into_vec(self) -> Vec<u8> {
        self.data
    }
}

/// This is effectively `libusb_handle_events_timeout_completed`, but with
/// `completed` as `AtomicBool` instead of `c_int` so it is safe to access
/// without the events lock held. It also continues polling until completion,
/// timeout, or error, instead of potentially returning early.
///
/// This design is based on
/// [this](https://libusb.sourceforge.io/api-1.0/libusb_mtasync.html#threadwait).
///
/// Returns `true` when `completed` becomes true, `false` on timeout, and panics on
/// any other libusb error.
fn poll_completed(ctx: &impl UsbContext, timeout: Duration, completed: &AtomicBool) -> bool {
    let deadline = Instant::now() + timeout;

    let mut err = ffi::constants::LIBUSB_SUCCESS;
    while err == ffi::constants::LIBUSB_SUCCESS
        && !completed.load(Ordering::SeqCst)
        && deadline > Instant::now()
    {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let timeval = libc::timeval {
            tv_sec: remaining.as_secs().try_into().unwrap(),
            tv_usec: remaining.subsec_micros().into(),
        };
        unsafe {
            if ffi::libusb_try_lock_events(ctx.as_raw()) == ffi::constants::LIBUSB_SUCCESS {
                if !completed.load(Ordering::SeqCst)
                    && ffi::libusb_event_handling_ok(ctx.as_raw()) != ffi::constants::LIBUSB_SUCCESS
                {
                    err = ffi::libusb_handle_events_locked(ctx.as_raw(), addr_of!(timeval));
                }
                ffi::libusb_unlock_events(ctx.as_raw());
            } else {
                ffi::libusb_lock_event_waiters(ctx.as_raw());
                if !completed.load(Ordering::SeqCst)
                    && ffi::libusb_event_handler_active(ctx.as_raw())
                        != ffi::constants::LIBUSB_SUCCESS
                {
                    ffi::libusb_wait_for_event(ctx.as_raw(), addr_of!(timeval));
                }
                ffi::libusb_unlock_event_waiters(ctx.as_raw());
            }
        }
    }

    match err {
        ffi::constants::LIBUSB_SUCCESS => completed.load(Ordering::SeqCst),
        ffi::constants::LIBUSB_ERROR_TIMEOUT => false,
        _ => panic!(
            "Error {} when polling transfers: {}",
            err,
            unsafe { std::ffi::CStr::from_ptr(ffi::libusb_strerror(err)) }.to_string_lossy()
        ),
    }
}
