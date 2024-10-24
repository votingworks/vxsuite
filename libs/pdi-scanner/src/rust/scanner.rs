use std::{
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc,
    },
    thread,
    time::Duration,
};

use rusb::UsbContext;

use crate::{protocol::parsers, rusb_async, Result};

use super::protocol::packets::{self, Incoming};

type ScannerChannels = (
    Sender<(usize, packets::Outgoing)>,
    Receiver<usize>,
    Receiver<Result<packets::Incoming>>,
);

pub struct Scanner {
    device_handle: Arc<rusb::DeviceHandle<rusb::Context>>,
    default_timeout: Duration,
    stop_tx: Option<mpsc::Sender<()>>,
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

    pub fn start(&mut self) -> ScannerChannels {
        /// The endpoint for sending commands to the scanner.
        const ENDPOINT_OUT: u8 = 0x05;

        /// The primary endpoint for receiving responses from the scanner.
        const ENDPOINT_IN_PRIMARY: u8 = 0x85;

        /// The alternate endpoint for receiving responses from the scanner, used to
        /// receive image data.
        const ENDPOINT_IN_IMAGE_DATA: u8 = 0x86;

        /// Make this big enough that we can receive just about any packet in one go.
        ///
        /// For letter size, we have ~1700 × 2200 pixels, which is ~3.7 million
        /// pixels. Each pixel is a single bit with bitonal scanning (which is
        /// what we use), so we need 3.7 million bits or ~470 KB. For duplex, we
        /// need double that, so 940 KB. For a 22" ballot, we double that again,
        /// so let's say 2 MB to be safe. In the event the rollers roll for a
        /// bit trying to catch the paper, we might need a bit more. So for any
        /// reasonable paper size, 4 MB should be plenty and doesn't really put
        /// a dent in available memory.
        #[cfg(production)]
        const BUFFER_SIZE: usize = 4_194_304;

        /// For development, we want a smaller buffer because, for reasons we
        /// don't understand, communicating with the scanner times out with a
        /// larger buffer.
        #[cfg(not(production))]
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

                loop {
                    if let Ok(()) = stop_rx.try_recv() {
                        tracing::debug!("Scanner thread received stop signal");
                        break;
                    }

                    match host_to_scanner_rx.try_recv() {
                        Ok((id, packet)) => {
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
                                    scanner_to_host_tx.send(Ok(packet)).unwrap();
                                }
                                Ok((remaining, packet)) => {
                                    tracing::warn!(
                                        "Received packet: {packet:?} with {len} bytes remaining: {remaining:?}",
                                        len = remaining.len(),
                                        remaining = String::from_utf8_lossy(remaining)
                                    );
                                    scanner_to_host_tx
                                        .send(Ok(Incoming::Unknown(data.to_vec())))
                                        .unwrap();
                                }
                                Err(err) => {
                                    tracing::error!(
                                        "Error parsing packet: {data:?} (err={err})",
                                        data = String::from_utf8_lossy(&data)
                                    );
                                    scanner_to_host_tx
                                        .send(Ok(Incoming::Unknown(data.to_vec())))
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
                            tracing::error!("Error while polling primary IN endpoint: {err}");
                            scanner_to_host_tx.send(Err(err.into())).unwrap();
                            break;
                        }
                    }

                    match transfer_pool
                        .poll_endpoint(ENDPOINT_IN_IMAGE_DATA, Duration::from_millis(1))
                    {
                        Ok(data) => {
                            tracing::debug!("Received image data: {len} bytes", len = data.len());
                            scanner_to_host_tx
                                .send(Ok(packets::Incoming::ImageData(data.clone())))
                                .unwrap();

                            // resubmit the transfer to receive more data
                            transfer_pool
                                .submit_bulk(ENDPOINT_IN_IMAGE_DATA, data)
                                .unwrap();
                        }
                        Err(rusb_async::Error::PollTimeout) => {}
                        Err(err) => {
                            tracing::error!("Error while polling image data endpoint: {err}");
                            scanner_to_host_tx.send(Err(err.into())).unwrap();
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

    /// Stop listening for incoming packets and close the connection to the
    /// scanner. This is automatically called when the `Scanner` instance is
    /// dropped.
    pub fn stop(&mut self) {
        if let Some(stop_tx) = self.stop_tx.take() {
            // send will only error if its receiver has been dropped, which
            // means the scanner is already cleaned up, so it's safe to ignore
            // the error here.
            let _ = stop_tx.send(());
        }

        if let Some(thread_handle) = self.thread_handle.take() {
            thread_handle.join().unwrap();
        }
    }
}

impl Drop for Scanner {
    fn drop(&mut self) {
        self.stop();
    }
}
