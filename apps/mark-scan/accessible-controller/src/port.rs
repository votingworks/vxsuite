use std::{
    fmt, io, thread,
    time::{Duration, Instant},
};

use serialport::SerialPort;
use vx_logging::{log, Disposition, EventId, EventType};

use crate::commands::EchoCommand;

const DEVICE_PATH: &str = "/dev/ttyACM1";
const DEVICE_BAUD_RATE: u32 = 9600;
const MAX_ECHO_RESPONSE_WAIT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

pub struct Port {
    inner: Box<dyn SerialPort>,
}

impl Port {
    pub fn open() -> color_eyre::Result<Self> {
        let inner = serialport::new(DEVICE_PATH, DEVICE_BAUD_RATE)
            .timeout(POLL_INTERVAL)
            .open()?;
        let mut port = Self { inner };
        port.validate_connection()?;
        Ok(port)
    }

    fn validate_connection(&mut self) -> Result<(), io::Error> {
        let echo_command = EchoCommand::new(&[0x01, 0x02, 0x03, 0x04, 0x05]);
        let echo_command: Vec<u8> = echo_command.into();
        let port = &mut self.inner;
        match port.write(&echo_command) {
            Ok(_) => log!(EventId::ControllerHandshakeInit; EventType::SystemAction),
            Err(error) => eprintln!("{error:?}"),
        }

        let mut serial_buf = [0; 20];

        let start_time = Instant::now();
        loop {
            match port.read(&mut serial_buf) {
                Ok(size) => {
                    let echo_response = &serial_buf[..size];
                    assert_eq!(
                        echo_command, echo_response,
                        "Received different response from echo command: {echo_response:02x?}"
                    );

                    log!(
                        event_id: EventId::ControllerHandshakeComplete,
                        event_type: EventType::SystemAction,
                        disposition: Disposition::Success
                    );
                    return Ok(());
                }
                Err(ref e) if e.kind() == io::ErrorKind::TimedOut => (),
                Err(e) => {
                    log!(
                        event_id: EventId::ControllerHandshakeComplete,
                        message: format!("Error reading echo response: {e:?}"),
                        event_type: EventType::SystemAction,
                        disposition: Disposition::Failure
                    );
                }
            }

            if start_time.elapsed() >= MAX_ECHO_RESPONSE_WAIT {
                break;
            }

            thread::sleep(POLL_INTERVAL);
        }

        log!(
            event_id: EventId::ControllerHandshakeComplete,
            message: "No echo response received".to_string(),
            event_type: EventType::SystemAction,
            disposition: Disposition::Failure
        );
        Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "No echo response received",
        ))
    }
}

impl io::Read for Port {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.inner.read(buf)
    }
}

impl fmt::Debug for Port {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Port")
            .field("name", &self.inner.name())
            .field("baud_rate", &self.inner.baud_rate())
            .finish()
    }
}
