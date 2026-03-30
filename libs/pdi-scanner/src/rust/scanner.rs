use std::{future::Future, sync::Arc, time::Duration};

use nusb::transfer::{Completion, RequestBuffer, TransferError};

use crate::{protocol::parsers, Result, UsbError};

use super::protocol::packets::{self, Incoming};

pub(crate) trait BulkInQueue: Send + 'static {
    fn submit(&mut self, buf: RequestBuffer);
    fn next_complete(&mut self) -> impl Future<Output = Completion<Vec<u8>>> + Send + '_;
}

pub(crate) trait UsbInterface: Send + Sync + 'static {
    type BulkInQueue: BulkInQueue;
    fn bulk_in_queue(&self, endpoint: u8) -> Self::BulkInQueue;
    fn bulk_out(
        &self,
        endpoint: u8,
        data: Vec<u8>,
    ) -> impl Future<Output = Result<(), TransferError>> + Send + '_;
}

impl BulkInQueue for nusb::transfer::Queue<RequestBuffer> {
    fn submit(&mut self, buf: RequestBuffer) {
        self.submit(buf);
    }

    fn next_complete(&mut self) -> impl Future<Output = Completion<Vec<u8>>> + Send + '_ {
        nusb::transfer::Queue::<RequestBuffer>::next_complete(self)
    }
}

impl UsbInterface for nusb::Interface {
    type BulkInQueue = nusb::transfer::Queue<RequestBuffer>;

    fn bulk_in_queue(&self, endpoint: u8) -> Self::BulkInQueue {
        nusb::Interface::bulk_in_queue(self, endpoint)
    }

    async fn bulk_out(&self, endpoint: u8, data: Vec<u8>) -> Result<(), TransferError> {
        nusb::Interface::bulk_out(self, endpoint, data).await.status
    }
}

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

#[allow(clippy::struct_field_names)]
pub struct Scanner {
    pub(crate) host_to_scanner_tx: tokio::sync::mpsc::UnboundedSender<(usize, packets::Outgoing)>,
    pub(crate) host_to_scanner_ack_rx: tokio::sync::mpsc::UnboundedReceiver<usize>,
    pub(crate) scanner_to_host_rx: tokio::sync::mpsc::UnboundedReceiver<Result<packets::Incoming>>,
    stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
    task_handle: Option<tokio::task::JoinHandle<()>>,
}

impl Scanner {
    /// Opens a connection to the scanner, starts the background USB I/O task,
    /// and returns a handle for communicating with and disconnecting from the
    /// scanner.
    ///
    /// # Errors
    ///
    /// Fails if the device cannot be found, the connection cannot be opened, or
    /// the interface cannot be claimed.
    pub fn connect() -> Result<Self> {
        let interface = Arc::new(open_usb_interface()?);
        Ok(poll_scanner(&interface, Duration::from_secs(1)))
    }

    /// Creates a scanner with mock channels and no background task. The
    /// returned scanner's `disconnect` is a no-op. Used for testing
    /// [`Client`](crate::client::Client) without real USB hardware.
    #[must_use]
    pub fn mock(
        host_to_scanner_tx: tokio::sync::mpsc::UnboundedSender<(usize, packets::Outgoing)>,
        host_to_scanner_ack_rx: tokio::sync::mpsc::UnboundedReceiver<usize>,
        scanner_to_host_rx: tokio::sync::mpsc::UnboundedReceiver<Result<packets::Incoming>>,
    ) -> Self {
        Self {
            host_to_scanner_tx,
            host_to_scanner_ack_rx,
            scanner_to_host_rx,
            stop_tx: None,
            task_handle: None,
        }
    }

    /// Disconnects from the scanner by stopping the background task and
    /// releasing the USB interface. Waits for the background task to fully
    /// stop before returning, ensuring the USB handle is released.
    pub async fn disconnect(mut self) {
        if let Some(stop_tx) = self.stop_tx.take() {
            let _ = stop_tx.send(());
        }
        if let Some(handle) = self.task_handle.take() {
            if let Err(err) = handle.await {
                tracing::error!("Scanner background task failed: {err:?}");
            }
        }
        tracing::debug!("Scanner disconnected");
    }
}

/// Finds the PDI scanner on the USB bus, opens it, and claims its interface.
///
/// # Errors
///
/// Fails if the device is not found, cannot be opened, or the interface
/// cannot be claimed.
fn open_usb_interface() -> Result<nusb::Interface> {
    const INTERFACE: u8 = 0;

    let device = find_pdi_device()?;

    // Reset the USB device to prevent possible image corruption on the first
    // scan after reconnection. Without this, the first scan may produce images
    // with a horizontal pixel offset and dark bands at the top — we hypothesize
    // this is due to stale data in the scanner's internal buffer. The reset
    // triggers a USB bus reset and forces the device to re-enumerate.
    device.reset()?;

    // reset() invalidates the device handle, so re-find the device.
    let device = find_pdi_device()?;
    device.set_configuration(1)?;
    let scanner_interface = device.detach_and_claim_interface(INTERFACE)?;
    tracing::debug!("Connected to PDI scanner and claimed interface {INTERFACE}");

    Ok(scanner_interface)
}

fn find_pdi_device() -> Result<nusb::Device> {
    /// Vendor ID for the PDI scanner.
    const VENDOR_ID: u16 = 0x0bd7;

    /// Product ID for the PDI scanner.
    const PRODUCT_ID: u16 = 0xa002;

    nusb::list_devices()?
        .find(|d| d.vendor_id() == VENDOR_ID && d.product_id() == PRODUCT_ID)
        .ok_or(UsbError::DeviceNotFound)?
        .open()
        .map_err(Into::into)
}

/// Spawns a background task that bridges USB I/O with in-process channels.
/// The task polls the primary and image data USB endpoints for incoming
/// packets, parses them, and forwards them to the returned scanner's
/// channels. Outgoing packets sent on the scanner's channels are serialized
/// and written to the USB OUT endpoint.
///
/// # Panics
///
/// If the in-process channel between the scanner and the client becomes
/// disconnected.
#[allow(clippy::unwrap_used)]
#[allow(clippy::too_many_lines)]
fn poll_scanner<U: UsbInterface>(usb_interface: &Arc<U>, default_timeout: Duration) -> Scanner {
    let (host_to_scanner_tx, mut host_to_scanner_rx) =
        tokio::sync::mpsc::unbounded_channel::<(usize, packets::Outgoing)>();
    let (host_to_scanner_ack_tx, host_to_scanner_ack_rx) =
        tokio::sync::mpsc::unbounded_channel::<usize>();
    let (scanner_to_host_tx, scanner_to_host_rx) = tokio::sync::mpsc::unbounded_channel();
    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel();

    let mut in_primary_queue = usb_interface.bulk_in_queue(ENDPOINT_IN_PRIMARY);
    let mut in_image_data_queue = usb_interface.bulk_in_queue(ENDPOINT_IN_IMAGE_DATA);
    let device_handle = usb_interface.clone();

    let task_handle = tokio::spawn(async move {
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
                    if let Err(err) = completion.status {
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
                    if let Err(err) = completion.status {
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

                    match tokio::time::timeout(
                        default_timeout,
                        device_handle.bulk_out(ENDPOINT_OUT, bytes),
                    )
                    .await
                    {
                        Ok(Ok(())) => {
                            host_to_scanner_ack_tx.send(id).unwrap();
                        }
                        Ok(Err(err)) => {
                            tracing::error!("Error sending outgoing packet: {err:?}");
                            scanner_to_host_tx.send(Err(err.into())).unwrap();
                            break;
                        }
                        Err(_) => {
                            tracing::error!("Timeout sending outgoing packet");
                            let err = nusb::Error::new(
                                std::io::ErrorKind::TimedOut,
                                "timed out sending outgoing packet",
                            );
                            scanner_to_host_tx.send(Err(err.into())).unwrap();
                            break;
                        }
                    }
                }
            }
        }
    });

    Scanner {
        host_to_scanner_tx,
        host_to_scanner_ack_rx,
        scanner_to_host_rx,
        stop_tx: Some(stop_tx),
        task_handle: Some(task_handle),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        sync::{Arc, Mutex},
        time::Duration,
    };

    use nusb::transfer::{Completion, RequestBuffer, TransferError};
    use tokio::{sync::mpsc, time::timeout};

    use crate::{Error, UsbError};

    use crate::protocol::packets::{
        ImageData, Incoming, Outgoing, PACKET_DATA_END, PACKET_DATA_START,
    };

    use super::{
        poll_scanner, BulkInQueue, Scanner, UsbInterface, ENDPOINT_IN_IMAGE_DATA,
        ENDPOINT_IN_PRIMARY, ENDPOINT_OUT,
    };

    const TEST_TIMEOUT: Duration = Duration::from_millis(100);

    /// Encode a packet body into the wire format the parser expects.
    fn encode_packet(body: &[u8]) -> Vec<u8> {
        let mut data =
            Vec::with_capacity(PACKET_DATA_START.len() + body.len() + PACKET_DATA_END.len());
        data.extend_from_slice(PACKET_DATA_START);
        data.extend_from_slice(body);
        data.extend_from_slice(PACKET_DATA_END);
        data
    }

    /// Raw body bytes for known incoming events (from parsers module).
    const COVER_OPEN_EVENT_BODY: &[u8] = b"#0C";

    // --- MockInterface ---

    type Submissions = Arc<Mutex<Vec<RequestBuffer>>>;

    struct MockBulkInQueue {
        rx: mpsc::UnboundedReceiver<Completion<Vec<u8>>>,
        submissions: Submissions,
    }

    impl BulkInQueue for MockBulkInQueue {
        fn submit(&mut self, buf: RequestBuffer) {
            self.submissions.lock().unwrap().push(buf);
        }

        async fn next_complete(&mut self) -> Completion<Vec<u8>> {
            self.rx.recv().await.unwrap_or(Completion {
                data: Vec::new(),
                status: Err(TransferError::Cancelled),
            })
        }
    }

    type MockQueues =
        Arc<Mutex<HashMap<u8, (mpsc::UnboundedReceiver<Completion<Vec<u8>>>, Submissions)>>>;

    struct MockInterface {
        bulk_out_data_tx: mpsc::UnboundedSender<(u8, Vec<u8>)>,
        bulk_out_response_rx:
            tokio::sync::Mutex<mpsc::UnboundedReceiver<Result<(), TransferError>>>,
        queues: MockQueues,
    }

    impl UsbInterface for MockInterface {
        type BulkInQueue = MockBulkInQueue;

        fn bulk_in_queue(&self, endpoint: u8) -> MockBulkInQueue {
            let (rx, submissions) = self
                .queues
                .lock()
                .unwrap()
                .remove(&endpoint)
                .unwrap_or_else(|| panic!("no mock queue for endpoint 0x{endpoint:02x}"));
            MockBulkInQueue { rx, submissions }
        }

        async fn bulk_out(&self, endpoint: u8, data: Vec<u8>) -> Result<(), TransferError> {
            self.bulk_out_data_tx
                .send((endpoint, data))
                .map_err(|_| TransferError::Cancelled)?;
            self.bulk_out_response_rx
                .lock()
                .await
                .recv()
                .await
                .unwrap_or(Err(TransferError::Cancelled))
        }
    }

    struct MockHandles {
        primary_tx: mpsc::UnboundedSender<Completion<Vec<u8>>>,
        image_data_tx: mpsc::UnboundedSender<Completion<Vec<u8>>>,
        bulk_out_data_rx: mpsc::UnboundedReceiver<(u8, Vec<u8>)>,
        bulk_out_response_tx: mpsc::UnboundedSender<Result<(), TransferError>>,
        primary_submissions: Submissions,
        image_data_submissions: Submissions,
    }

    fn mock_interface_and_handles() -> (MockInterface, MockHandles) {
        let (primary_tx, primary_rx) = mpsc::unbounded_channel();
        let (image_data_tx, image_data_rx) = mpsc::unbounded_channel();
        let (bulk_out_data_tx, bulk_out_data_rx) = mpsc::unbounded_channel();
        let (bulk_out_response_tx, bulk_out_response_rx) = mpsc::unbounded_channel();

        let primary_submissions = Submissions::default();
        let image_data_submissions = Submissions::default();

        let queues = HashMap::from([
            (
                ENDPOINT_IN_PRIMARY,
                (primary_rx, Arc::clone(&primary_submissions)),
            ),
            (
                ENDPOINT_IN_IMAGE_DATA,
                (image_data_rx, Arc::clone(&image_data_submissions)),
            ),
        ]);

        (
            MockInterface {
                bulk_out_data_tx,
                bulk_out_response_rx: tokio::sync::Mutex::new(bulk_out_response_rx),
                queues: Arc::new(Mutex::new(queues)),
            },
            MockHandles {
                primary_tx,
                image_data_tx,
                bulk_out_data_rx,
                bulk_out_response_tx,
                primary_submissions,
                image_data_submissions,
            },
        )
    }

    fn start_mock_scanner() -> (MockHandles, Scanner) {
        start_mock_scanner_with_timeout(Duration::from_secs(1))
    }

    fn start_mock_scanner_with_timeout(default_timeout: Duration) -> (MockHandles, Scanner) {
        let (interface, handles) = mock_interface_and_handles();
        let scanner = poll_scanner(&Arc::new(interface), default_timeout);
        (handles, scanner)
    }

    // --- Incoming: primary endpoint ---

    #[tokio::test]
    async fn incoming_primary_packet_parsed_and_forwarded() {
        let (handles, mut scanner) = start_mock_scanner();

        handles
            .primary_tx
            .send(Completion {
                data: encode_packet(COVER_OPEN_EVENT_BODY),
                status: Ok(()),
            })
            .unwrap();

        let packet = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(packet, Incoming::CoverOpenEvent);
    }

    #[tokio::test]
    async fn incoming_primary_parse_failure_produces_unknown() {
        let (handles, mut scanner) = start_mock_scanner();

        let garbage = b"not a valid packet".to_vec();
        handles
            .primary_tx
            .send(Completion {
                data: garbage.clone(),
                status: Ok(()),
            })
            .unwrap();

        let packet = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(packet, Incoming::Unknown(garbage));
    }

    #[tokio::test]
    async fn incoming_primary_partial_parse_produces_unknown() {
        let (handles, mut scanner) = start_mock_scanner();

        // Valid CoverOpenEvent followed by trailing garbage
        let mut data = encode_packet(COVER_OPEN_EVENT_BODY);
        data.extend_from_slice(b"trailing");
        handles
            .primary_tx
            .send(Completion {
                data: data.clone(),
                status: Ok(()),
            })
            .unwrap();

        let packet = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(packet, Incoming::Unknown(data));
    }

    // --- Incoming: image data endpoint ---

    #[tokio::test]
    async fn incoming_image_data_forwarded() {
        let (handles, mut scanner) = start_mock_scanner();

        let image_bytes = vec![0xAA, 0xBB, 0xCC];
        handles
            .image_data_tx
            .send(Completion {
                data: image_bytes.clone(),
                status: Ok(()),
            })
            .unwrap();

        let packet = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(packet, Incoming::ImageData(ImageData(image_bytes)));
    }

    // --- Outgoing ---

    #[tokio::test]
    async fn outgoing_command_forwarded_and_acked() {
        let (mut handles, mut scanner) = start_mock_scanner();

        scanner
            .host_to_scanner_tx
            .send((123, Outgoing::EnableCrcCheckingRequest))
            .unwrap();

        // Verify the serialized bytes arrive on the correct endpoint
        let (endpoint, data) = timeout(TEST_TIMEOUT, handles.bulk_out_data_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(endpoint, ENDPOINT_OUT);
        assert_eq!(data, Outgoing::EnableCrcCheckingRequest.to_bytes());

        handles.bulk_out_response_tx.send(Ok(())).unwrap();

        // Verify the ack
        let ack_id = timeout(TEST_TIMEOUT, scanner.host_to_scanner_ack_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(ack_id, 123);
    }

    // --- Errors ---

    #[tokio::test]
    async fn incoming_primary_error_forwarded_and_task_exits() {
        let (handles, mut scanner) = start_mock_scanner();

        handles
            .primary_tx
            .send(Completion {
                data: Vec::new(),
                status: Err(TransferError::Disconnected),
            })
            .unwrap();

        let result = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(result.is_err());

        // Task should have exited — channel closes
        assert!(scanner.scanner_to_host_rx.recv().await.is_none());
    }

    #[tokio::test]
    async fn incoming_image_data_error_forwarded_and_task_exits() {
        let (handles, mut scanner) = start_mock_scanner();

        handles
            .image_data_tx
            .send(Completion {
                data: Vec::new(),
                status: Err(TransferError::Fault),
            })
            .unwrap();

        let result = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(result.is_err());

        assert!(scanner.scanner_to_host_rx.recv().await.is_none());
    }

    #[tokio::test]
    async fn outgoing_transfer_error_forwarded_and_task_exits() {
        let (mut handles, mut scanner) = start_mock_scanner();

        scanner
            .host_to_scanner_tx
            .send((1, Outgoing::EnableCrcCheckingRequest))
            .unwrap();

        let (endpoint, _data) = timeout(TEST_TIMEOUT, handles.bulk_out_data_rx.recv())
            .await
            .unwrap()
            .expect("bulk_out data channel closed before write was observed");
        assert_eq!(endpoint, ENDPOINT_OUT);
        handles
            .bulk_out_response_tx
            .send(Err(TransferError::Disconnected))
            .unwrap();

        let err = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap_err();
        assert!(matches!(
            err,
            Error::Usb {
                source: UsbError::NusbTransfer(TransferError::Disconnected),
                ..
            }
        ));

        // Task should have exited — channel closes
        assert!(scanner.scanner_to_host_rx.recv().await.is_none());
    }

    #[tokio::test]
    async fn outgoing_timeout_sends_error_and_task_exits() {
        // Use a short timeout so the test runs quickly
        let (mut handles, mut scanner) = start_mock_scanner_with_timeout(Duration::from_millis(10));

        scanner
            .host_to_scanner_tx
            .send((1, Outgoing::EnableCrcCheckingRequest))
            .unwrap();

        // Wait for the packet to arrive at the mock (before the timeout fires)
        let (endpoint, _data) = timeout(TEST_TIMEOUT, handles.bulk_out_data_rx.recv())
            .await
            .unwrap()
            .expect("bulk_out data channel closed before write was observed");
        assert_eq!(endpoint, ENDPOINT_OUT);

        // No response sent — mock hangs on response_rx until timeout fires
        let err = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap_err();
        assert!(matches!(
            &err,
            Error::Usb {
                source: UsbError::Nusb(e),
                ..
            } if e.kind() == std::io::ErrorKind::TimedOut
        ));

        // Task should have exited — channel closes
        assert!(scanner.scanner_to_host_rx.recv().await.is_none());
    }

    // --- Lifecycle ---

    #[tokio::test]
    async fn stop_signal_exits_task_cleanly() {
        let (_handles, scanner) = start_mock_scanner();

        scanner.disconnect().await;
    }

    #[tokio::test]
    async fn initial_submits_and_resubmission() {
        let (handles, mut scanner) = start_mock_scanner();

        // After start(), the task submits initial buffers:
        // 1 for primary, 2 for image data.
        // Yield until the background task has run its initial submits.
        timeout(TEST_TIMEOUT, async {
            loop {
                if !handles.primary_submissions.lock().unwrap().is_empty()
                    && handles.image_data_submissions.lock().unwrap().len() >= 2
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(handles.primary_submissions.lock().unwrap().len(), 1);
        assert_eq!(handles.image_data_submissions.lock().unwrap().len(), 2);

        // Send a primary endpoint completion — should trigger a resubmit
        handles
            .primary_tx
            .send(Completion {
                data: encode_packet(COVER_OPEN_EVENT_BODY),
                status: Ok(()),
            })
            .unwrap();
        let _ = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv()).await;
        assert_eq!(handles.primary_submissions.lock().unwrap().len(), 2);

        // Send an image data completion — should trigger a resubmit
        handles
            .image_data_tx
            .send(Completion {
                data: vec![0xAA],
                status: Ok(()),
            })
            .unwrap();
        let _ = timeout(TEST_TIMEOUT, scanner.scanner_to_host_rx.recv()).await;
        assert_eq!(handles.image_data_submissions.lock().unwrap().len(), 3);
    }
}
