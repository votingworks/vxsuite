use std::{
    fmt,
    fs::{self, File},
    io::{self, Read},
    str::from_utf8,
};

use vx_logging::{log, EventId};

const EXPORT_PIN_FILEPATH: &str = "/sys/class/gpio/export";
const UNEXPORT_PIN_FILEPATH: &str = "/sys/class/gpio/unexport";

pub struct Pin {
    address: u16,
}

impl Pin {
    pub const fn new(address: u16) -> Self {
        Self { address }
    }

    fn export(&self) -> io::Result<()> {
        fs::write(EXPORT_PIN_FILEPATH, self.to_string())
    }

    fn unexport(&self) -> io::Result<()> {
        fs::write(UNEXPORT_PIN_FILEPATH, self.to_string())
    }

    fn set_direction_in(&self) -> io::Result<()> {
        let filepath = format!("/sys/class/gpio/gpio{}/direction", self);
        fs::write(filepath, b"in")
    }

    pub fn tear_down(&self) {
        self.unexport()
            .expect("Unexpected failure to tear down pin");
    }

    pub fn set_up(&self) -> io::Result<()> {
        if let Err(err) = self.export() {
            log!(
                EventId::Unspecified,
                "Pin {self} export failed with err {err}. Attempting to unexport.",
            );
            self.unexport()?;
            log!(EventId::Unspecified, "Unexported pin {self} successfully");
            self.export()?;
        }

        self.set_direction_in()
    }

    pub fn is_active(&self) -> bool {
        let filepath = format!("/sys/class/gpio/gpio{self}/value");
        let mut file = File::open(filepath).unwrap();
        let mut buf = [0; 1];
        file.read_exact(&mut buf).unwrap();
        let string_value = from_utf8(&buf).unwrap();

        // Pin status does not follow boolean convention. We translate to typical
        // boolean convention here.
        // 1 is the default state, 0 is actioned state
        // connection status: 1 when PAT device is not plugged in, 0 when plugged in
        // A/B signal: 1 when no signal is sent from device, 0 when signal is sent
        match string_value {
            "0" => true,
            "1" => false,
            _ => {
                log!(
                    EventId::PatDeviceError,
                    "Unexpected value for pin #{self}: {string_value}",
                );
                false
            }
        }
    }
}

impl fmt::Display for Pin {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.address)
    }
}
