use std::{sync::Arc, time::Duration};

use nusb::transfer::RequestBuffer;

use crate::{protocol::parsers, Result, UsbError};

use super::protocol::packets::{self, Incoming};

type ScannerChannels = (
    tokio::sync::mpsc::UnboundedSender<(usize, packets::Outgoing)>,
    tokio::sync::mpsc::UnboundedReceiver<usize>,
    tokio::sync::mpsc::UnboundedReceiver<Result<packets::Incoming>>,
);

pub struct Scanner {
    scanner_interface: Arc<nusb::Interface>,
    default_timeout: Duration,
    stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
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

    #[allow(clippy::unwrap_used)]
    pub fn start(&mut self) -> ScannerChannels {
        /// The endpoint for sending commands to the scanner.
        const ENDPOINT_OUT: u8 = 0x05;

        /// The primary endpoint for receiving responses from the scanner.
        const ENDPOINT_IN_PRIMARY: u8 = 0x85;

        /// The alternate endpoint for receiving responses from the scanner, used to
        /// receive image data.
        const ENDPOINT_IN_IMAGE_DATA: u8 = 0x86;

        /// For receiving responses from the scanner (other than image data).
        const DEFAULT_BUFFER_SIZE: usize = 16_384;

        /// For receiving image data from the scanner. We need a slightly larger buffer
        /// for image data than the primary endpoint, because we want to be able to receive
        /// a big enough chunk of data to keep up with the scanner as it sends data,
        /// otherwise we get a `FifoOverflow` error from the scanner.
        const IMAGE_BUFFER_SIZE: usize = 1_048_576; // 1 MiB

        let (host_to_scanner_tx, mut host_to_scanner_rx) =
            tokio::sync::mpsc::unbounded_channel::<(usize, packets::Outgoing)>();
        let (host_to_scanner_ack_tx, host_to_scanner_ack_rx) =
            tokio::sync::mpsc::unbounded_channel::<usize>();
        let (scanner_to_host_tx, scanner_to_host_rx) = tokio::sync::mpsc::unbounded_channel();
        let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel();

        self.stop_tx = Some(stop_tx);

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

            loop {
                tokio::select! {
                    biased;

                    _ = &mut stop_rx => {
                        tracing::debug!("Scanner thread received stop signal");
                        break;
                    }

                    completion = in_image_data_queue.next_complete() => {
                        if completion.status.is_err() {
                            let err = completion.status.unwrap_err();
                            tracing::error!("Error while polling image data endpoint: {err:?}");
                            scanner_to_host_tx.send(Err(err.into())).unwrap();
                            break;
                        }
                        let data = completion.data;
                        tracing::debug!("Received image data: {len} bytes", len = data.len());
                        scanner_to_host_tx
                            .send(Ok(packets::Incoming::ImageData(packets::ImageData(data.clone()))))
                            .unwrap();

                        // resubmit the transfer to receive more data
                        in_image_data_queue.submit(RequestBuffer::reuse(data, IMAGE_BUFFER_SIZE));
                    }

                    completion = in_primary_queue.next_complete() => {
                        if completion.status.is_err() {
                            let err = completion.status.unwrap_err();
                            tracing::error!("Error while polling primary IN endpoint: {err:?}");
                            scanner_to_host_tx.send(Err(err.into())).unwrap();
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
                                scanner_to_host_tx.send(Ok(packet)).unwrap();
                            }
                            Ok((remaining, packet)) => {
                                tracing::warn!(
                                        "Received packet: {packet:?} with {len} bytes remaining: {remaining:?}",
                                        len = remaining.len(),
                                        remaining = String::from_utf8_lossy(remaining)
                                    );
                                scanner_to_host_tx
                                    .send(Ok(Incoming::Unknown(data.clone())))
                                    .unwrap();
                            }
                            Err(err) => {
                                tracing::error!(
                                    "Error parsing packet: {data:?} (err={err})",
                                    data = String::from_utf8_lossy(&data)
                                );
                                scanner_to_host_tx
                                    .send(Ok(Incoming::Unknown(data.clone())))
                                    .unwrap();
                            }
                        }

                        // resubmit the transfer to receive more data
                        in_primary_queue.submit(RequestBuffer::reuse(data, DEFAULT_BUFFER_SIZE));
                    }

                    Some((id, packet)) = host_to_scanner_rx.recv() => {
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

                        host_to_scanner_ack_tx.send(id).unwrap();
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
