use std::{
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc,
    },
    thread,
    time::Duration,
};

use rusb::UsbContext;

use crate::{
    protocol::parsers,
    rusb_async::{self, Error},
    Result,
};

use super::protocol::packets::{self, Incoming};

pub enum StopMode {
    CancelPendingTransfers,
    WaitUntilTransfersComplete,
}

pub struct Scanner {
    device_handle: Arc<rusb::DeviceHandle<rusb::Context>>,
    default_timeout: Duration,
    stop_tx: Option<mpsc::Sender<StopMode>>,
    thread_handle: Option<thread::JoinHandle<()>>,
}

impl Scanner {
    pub fn open() -> Result<Self> {
        /// Vendor ID for the PDI scanner.
        const VENDOR_ID: u16 = 0x0bd7;

        /// Product ID for the PDI scanner.
        const PRODUCT_ID: u16 = 0xa002;

        let ctx = rusb::Context::new()?;
        let Some(device) = ctx.devices()?.iter().find(|device| {
            device.device_descriptor().map_or(false, |device_desc| {
                device_desc.vendor_id() == VENDOR_ID && device_desc.product_id() == PRODUCT_ID
            })
        }) else {
            return Err(rusb::Error::NotFound.into());
        };

        let mut device_handle = device.open()?;
        device_handle.set_active_configuration(1)?;
        device_handle.claim_interface(0)?;

        let device_handle = Arc::new(device_handle);

        Ok(Self {
            device_handle,
            default_timeout: Duration::from_secs(1),
            stop_tx: None,
            thread_handle: None,
        })
    }

    pub fn set_default_timeout(&mut self, timeout: Duration) {
        self.default_timeout = timeout;
    }

    pub fn start(
        &mut self,
    ) -> (
        Sender<(usize, packets::Outgoing)>,
        Receiver<usize>,
        Receiver<packets::Incoming>,
    ) {
        /// The endpoint for sending commands to the scanner.
        const ENDPOINT_OUT: u8 = 0x05;

        /// The primary endpoint for receiving responses from the scanner.
        const ENDPOINT_IN_PRIMARY: u8 = 0x85;

        /// The alternate endpoint for receiving responses from the scanner, used to
        /// receive image data.
        const ENDPOINT_IN_IMAGE_DATA: u8 = 0x86;

        const BUFFER_SIZE: usize = 16_384;

        let (host_to_scanner_tx, host_to_scanner_rx) =
            mpsc::channel::<(usize, packets::Outgoing)>();
        let (host_to_scanner_ack_tx, host_to_scanner_ack_rx) = mpsc::channel::<usize>();
        let (scanner_to_host_tx, scanner_to_host_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();

        self.stop_tx = Some(stop_tx);

        let mut transfer_pool = rusb_async::TransferPool::new(self.device_handle.clone());
        let default_timeout = self.default_timeout;

        self.thread_handle = Some(thread::spawn({
            move || {
                tracing::debug!("Scanner thread started; submitting initial IN endpoint transfers");
                transfer_pool
                    .submit_bulk(ENDPOINT_IN_PRIMARY, vec![0; BUFFER_SIZE])
                    .unwrap();

                transfer_pool
                    .submit_bulk(ENDPOINT_IN_IMAGE_DATA, vec![0; BUFFER_SIZE])
                    .unwrap();

                let mut is_stopping = false;
                loop {
                    match stop_rx.try_recv() {
                        Ok(StopMode::CancelPendingTransfers) => {
                            tracing::debug!(
                                "Scanner thread received stop signal; cancelling all transfers"
                            );
                            transfer_pool.cancel_all();
                            break;
                        }
                        Ok(StopMode::WaitUntilTransfersComplete) => {
                            tracing::debug!(
                                "Scanner thread received stop signal; cancelling incoming transfers and waiting for outgoing transfers to complete"
                            );
                            is_stopping = true;
                            transfer_pool.cancel_all_for_endpoint(ENDPOINT_IN_PRIMARY);
                            transfer_pool.cancel_all_for_endpoint(ENDPOINT_IN_IMAGE_DATA);
                        }
                        Err(_) => {}
                    }

                    match host_to_scanner_rx.try_recv() {
                        Ok((id, packet)) => {
                            if is_stopping {
                                tracing::debug!(
                                    "Scanner thread received stop signal; dropping outgoing packet: {packet:?}"
                                );
                                continue;
                            }

                            let bytes = packet.to_bytes();
                            tracing::debug!(
                                "sending packet: {packet:?} (data: {data:?})",
                                data = String::from_utf8_lossy(&bytes)
                            );

                            transfer_pool.submit_bulk(ENDPOINT_OUT, bytes).unwrap();

                            // wait for submit_bulk to complete
                            transfer_pool
                                .poll_endpoint(ENDPOINT_OUT, default_timeout)
                                .unwrap();

                            host_to_scanner_ack_tx.send(id).unwrap();
                        }
                        Err(mpsc::TryRecvError::Empty) => {}
                        Err(e) => {
                            tracing::error!("Error receiving outgoing packet: {e}");
                            break;
                        }
                    }

                    if is_stopping {
                        let pending = transfer_pool.pending();
                        tracing::trace!(
                            "Scanner thread waiting for {pending} transfers to complete",
                            pending = pending
                        );
                        if pending == 0 {
                            tracing::debug!(
                                "Scanner thread received stop signal; all transfers complete"
                            );
                            break;
                        }
                    }

                    match transfer_pool.poll_endpoint(ENDPOINT_IN_PRIMARY, Duration::from_millis(1))
                    {
                        Ok(data) => {
                            tracing::debug!(
                                "Received data on primary endpoint: {len} bytes",
                                len = data.len()
                            );
                            match parsers::any_incoming(&data) {
                                Ok(([], packet)) => {
                                    tracing::debug!("Received incoming packet: {packet:?}");
                                    scanner_to_host_tx.send(packet).unwrap();
                                }
                                Ok((remaining, packet)) => {
                                    tracing::warn!(
                                        "Received packet: {packet:?} with {len} bytes remaining: {remaining:?}",
                                        len = remaining.len(),
                                        remaining = String::from_utf8_lossy(remaining)
                                    );
                                    scanner_to_host_tx
                                        .send(Incoming::Unknown(data.to_vec()))
                                        .unwrap();
                                }
                                Err(err) => {
                                    tracing::error!(
                                        "Error parsing packet: {data:?} (err={err})",
                                        data = String::from_utf8_lossy(&data)
                                    );
                                    scanner_to_host_tx
                                        .send(Incoming::Unknown(data.to_vec()))
                                        .unwrap();
                                }
                            }

                            // resubmit the transfer to receive more data
                            tracing::debug!("Resubmitting primary IN endpoint transfer");
                            transfer_pool
                                .submit_bulk(ENDPOINT_IN_PRIMARY, data)
                                .unwrap();
                        }
                        Err(rusb_async::Error::PollTimeout) => {}
                        Err(err) => {
                            if !is_stopping || !matches!(err, Error::Cancelled) {
                                tracing::error!("Error while polling primary IN endpoint: {err}");
                            }
                            break;
                        }
                    }

                    match transfer_pool
                        .poll_endpoint(ENDPOINT_IN_IMAGE_DATA, Duration::from_millis(1))
                    {
                        Ok(data) => {
                            tracing::debug!("Received image data: {len} bytes", len = data.len());
                            scanner_to_host_tx
                                .send(packets::Incoming::ImageData(data.clone()))
                                .unwrap();

                            // resubmit the transfer to receive more data
                            transfer_pool
                                .submit_bulk(ENDPOINT_IN_IMAGE_DATA, data)
                                .unwrap();
                        }
                        Err(rusb_async::Error::PollTimeout) => {}
                        Err(err) => {
                            if !is_stopping || !matches!(err, Error::Cancelled) {
                                tracing::error!("Error while polling image data endpoint: {err}");
                            }
                            break;
                        }
                    }
                }
            }
        }));

        (
            host_to_scanner_tx,
            host_to_scanner_ack_rx,
            scanner_to_host_rx,
        )
    }

    /// Stop the scanner. Blocks until cleanup is complete.
    pub fn stop(&mut self, mode: StopMode) {
        if let Some(stop_tx) = self.stop_tx.take() {
            stop_tx.send(mode).unwrap();
        }

        if let Some(thread_handle) = self.thread_handle.take() {
            thread_handle.join().unwrap();
        }
    }
}
