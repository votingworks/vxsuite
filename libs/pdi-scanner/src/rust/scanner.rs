use std::{sync::Arc, time::Duration};

use nusb::transfer::{Completion, RequestBuffer};
use tokio::sync::{
    mpsc::{self, Receiver, Sender},
    oneshot,
};

use crate::{
    protocol::{packets::Outgoing, parsers},
    Result, UsbError,
};

use super::protocol::packets::{self, Incoming};

type ScannerChannels = (
    Sender<(usize, packets::Outgoing)>,
    Receiver<usize>,
    Receiver<Result<packets::Incoming>>,
);

pub struct Scanner {
    scanner_interface: Arc<nusb::Interface>,
    default_timeout: Duration,
    stop_tx: Option<oneshot::Sender<()>>,
}

impl Scanner {
    pub fn open() -> Result<Self> {
        /// Vendor ID for the PDI scanner.
        const VENDOR_ID: u16 = 0x0bd7;

        /// Product ID for the PDI scanner.
        const PRODUCT_ID: u16 = 0xa002;

        const INTERFACE: u8 = 0;

        let mut devices = nusb::list_devices()?;
        let device = devices
            .find(|device| device.vendor_id() == VENDOR_ID && device.product_id() == PRODUCT_ID)
            .ok_or(UsbError::DeviceNotFound)?
            .open()?;
        device.set_configuration(1)?;
        let scanner_interface = device.detach_and_claim_interface(INTERFACE)?;
        tracing::debug!("Connected to PDI scanner and claimed interface {INTERFACE}");

        let scanner_interface = Arc::new(scanner_interface);

        Ok(Self {
            scanner_interface,
            default_timeout: Duration::from_secs(1),
            stop_tx: None,
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

        /// For receving responses from the scanner (other than image data).
        const DEFAULT_BUFFER_SIZE: usize = 16_384;

        /// For receiving image data from the scanner.
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
        const IMAGE_BUFFER_SIZE: usize = 4_194_304;

        let (host_to_scanner_tx, mut host_to_scanner_rx) =
            mpsc::channel::<(usize, packets::Outgoing)>(10);
        let (host_to_scanner_ack_tx, host_to_scanner_ack_rx) = mpsc::channel::<usize>(10);
        let (scanner_to_host_tx, scanner_to_host_rx) = mpsc::channel(10);
        let (stop_tx, mut stop_rx) = oneshot::channel();

        self.stop_tx = Some(stop_tx);

        // let mut transfer_pool = rusb_async::TransferPool::new(self.device_handle.clone());
        // let mut out_queue = self.device_handle.bulk_out_queue(ENDPOINT_OUT);
        let mut in_primary_queue = self.scanner_interface.bulk_in_queue(ENDPOINT_IN_PRIMARY);
        let mut in_image_data_queue = self.scanner_interface.bulk_in_queue(ENDPOINT_IN_IMAGE_DATA);
        let device_handle = self.scanner_interface.clone();
        let default_timeout = self.default_timeout;

        tokio::spawn(async move {
            tracing::debug!("Scanner thread started; submitting initial IN endpoint transfers");

            in_primary_queue.submit(RequestBuffer::new(DEFAULT_BUFFER_SIZE));

            // Submit two initial transfers to the image data transfer queue so
            // that we always have one ready to go while we process the other.
            // We want image data transfer to be as fast as possible so the
            // scanner doesn't overflow its internal buffer.
            in_image_data_queue.submit(RequestBuffer::new(IMAGE_BUFFER_SIZE));
            in_image_data_queue.submit(RequestBuffer::new(IMAGE_BUFFER_SIZE));

            enum Action {
                Stop,
                HostToScanner(usize, Outgoing),
                IncomingPrimary(Completion<Vec<u8>>),
                IncomingImage(Completion<Vec<u8>>),
            }

            loop {
                let action = tokio::select! {
                    _ = &mut stop_rx => {
                        Action::Stop
                    },
                    Some((id, packet)) = host_to_scanner_rx.recv() => {
                        Action::HostToScanner(id, packet)
                    },
                    completion = in_primary_queue.next_complete() => {
                        Action::IncomingPrimary(completion)
                    },
                    completion = in_image_data_queue.next_complete() => {
                        Action::IncomingImage(completion)
                    },
                };

                match action {
                    Action::Stop => {
                        tracing::debug!("Scanner thread received stop signal");
                        break;
                    }

                    Action::HostToScanner(id, packet) => {
                        let bytes = packet.to_bytes();
                        tracing::debug!(
                            "sending packet: {packet:?} (data: {data:?})",
                            data = String::from_utf8_lossy(&bytes)
                        );

                        let completion = tokio::time::timeout(
                            default_timeout,
                            device_handle.bulk_out(ENDPOINT_OUT, bytes),
                        )
                        .await
                        .unwrap();
                        completion.status.expect("Error sending outgoing packet");

                        host_to_scanner_ack_tx.send(id).await.unwrap();
                    }

                    Action::IncomingPrimary(completion) => {
                        if completion.status.is_err() {
                            let err = completion.status.unwrap_err();
                            tracing::error!("Error while polling primary IN endpoint: {err:?}");
                            scanner_to_host_tx.send(Err(err.into())).await.unwrap();
                            break;
                        }
                        let data = completion.data;
                        tracing::debug!(
                            "Received data on primary endpoint: {len} bytes",
                            len = data.len()
                        );
                        match parsers::any_incoming(&data) {
                            Ok(([], packet)) => {
                                tracing::debug!("Received incoming packet: {packet:?}");
                                scanner_to_host_tx.send(Ok(packet)).await.unwrap();
                            }
                            Ok((remaining, packet)) => {
                                tracing::warn!(
                                        "Received packet: {packet:?} with {len} bytes remaining: {remaining:?}",
                                        len = remaining.len(),
                                        remaining = String::from_utf8_lossy(remaining)
                                    );
                                scanner_to_host_tx
                                    .send(Ok(Incoming::Unknown(data.to_vec())))
                                    .await
                                    .unwrap();
                            }
                            Err(err) => {
                                tracing::error!(
                                    "Error parsing packet: {data:?} (err={err})",
                                    data = String::from_utf8_lossy(&data)
                                );
                                scanner_to_host_tx
                                    .send(Ok(Incoming::Unknown(data.to_vec())))
                                    .await
                                    .unwrap();
                            }
                        }

                        // resubmit the transfer to receive more data
                        in_primary_queue.submit(RequestBuffer::reuse(data, DEFAULT_BUFFER_SIZE));
                    }

                    Action::IncomingImage(completion) => {
                        if completion.status.is_err() {
                            let err = completion.status.unwrap_err();
                            tracing::error!("Error while polling image data endpoint: {err:?}");
                            scanner_to_host_tx.send(Err(err.into())).await.unwrap();
                            break;
                        }
                        let data = completion.data;
                        tracing::debug!("Received image data: {len} bytes", len = data.len());
                        scanner_to_host_tx
                            .send(Ok(packets::Incoming::ImageData(data.clone())))
                            .await
                            .unwrap();

                        // resubmit the transfer to receive more data
                        in_image_data_queue.submit(RequestBuffer::reuse(data, IMAGE_BUFFER_SIZE));
                    }
                }
            }
        });

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
    }
}

impl Drop for Scanner {
    fn drop(&mut self) {
        self.stop();
    }
}
