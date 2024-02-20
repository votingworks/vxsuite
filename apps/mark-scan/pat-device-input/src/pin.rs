use std::{
    fmt,
    fs::{self, File},
    io::{self, Read},
    str::from_utf8,
};

use vx_logging::{log, EventId};

const EXPORT_PIN_FILEPATH: &str = "/sys/class/gpio/export";
const UNEXPORT_PIN_FILEPATH: &str = "/sys/class/gpio/unexport";

/// Pin provides an interface to read GPIO pins that support the sysfs protocol.
///
/// # Example
///
/// ```
/// const PIN_NUMBER = 478;
/// const MY_PIN: Pin = Pin::new(PIN_NUMBER);
/// MY_PIN.set_up()?;
/// let is_active = MY_PIN.is_active();
/// do_something_with_value(is_active);
/// ```
pub struct Pin {
    address: u16,
}

impl Pin {
    /// Creates a new instance of Pin at the given address (pin number).
    pub const fn new(address: u16) -> Self {
        Self { address }
    }

    // Exports the pin to be globally accessible from userspace.
    fn export(&self) -> io::Result<()> {
        fs::write(EXPORT_PIN_FILEPATH, self.to_string())
    }

    // Unexports the pin, removing access from userspace.
    fn unexport(&self) -> io::Result<()> {
        fs::write(UNEXPORT_PIN_FILEPATH, self.to_string())
    }

    // Sets the pin direction to "in" so its value is readable. Must be called after
    // `export`
    fn set_direction_in(&self) -> io::Result<()> {
        let filepath = format!("/sys/class/gpio/gpio{self}/direction");
        fs::write(filepath, b"in")
    }

    /// Removes access to the pin from userspace.
    pub fn tear_down(&self) {
        self.unexport()
            .expect("Unexpected failure to tear down pin");
    }

    /// Makes the pin accessible from userspace. If the pin is already set up due to
    /// a previous `set_up` call, or from other callers of the sysfs interface, `set_up`
    /// will tear down the pin and attempt one more time to set up. This may cause
    /// interruption to other processes attempting to read the pin value.
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

    /// Reads the pin value and returns the boolean inverse of the pin's raw value.
    /// # Example
    /// When the pin's value is b'0', `is_active` returns true.
    pub fn is_active(&self) -> bool {
        let filepath = format!("/sys/class/gpio/gpio{self}/value");
        let Ok(mut file) = File::open(filepath) else {
            log!(
                EventId::PatDeviceError,
                "Failed to open file for pin {self}",
            );
            return false;
        };

        let mut buf = [0; 1];
        if let Err(e) = file.read_exact(&mut buf) {
            log!(
                EventId::PatDeviceError,
                "Failed to read file for pin {self}: {e}",
            );
            return false;
        }

        // Pin status does not follow boolean convention. We translate to typical
        // boolean convention here.
        // 1 is the default state, 0 is actioned state
        // connection status: 1 when PAT device is not plugged in, 0 when plugged in
        // A/B signal: 1 when no signal is sent from device, 0 when signal is sent
        match buf[0] {
            b'0' => true,
            b'1' => false,
            _ => {
                log!(
                    EventId::PatDeviceError,
                    "Unexpected value for pin #{self}: {char}",
                    char = buf[0] as char,
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
