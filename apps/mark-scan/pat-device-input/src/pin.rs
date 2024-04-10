use std::{
    fmt,
    fs::{self, File},
    io::{self, Read},
    thread::sleep,
    time::Duration,
};

use vx_logging::{log, EventId};

const EXPORT_PIN_FILEPATH: &str = "/sys/class/gpio/export";
const UNEXPORT_PIN_FILEPATH: &str = "/sys/class/gpio/unexport";
const EXPORT_DELAY: Duration = Duration::from_millis(250);

pub trait Pin: fmt::Display {
    fn new(address: u16) -> Self;
    fn probe(&self) -> Result<(), io::Error>;
    fn set_up(&self) -> Result<(), io::Error>;
    fn tear_down(&self);
    fn is_active(&self) -> bool;
}

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
pub struct GpioPin {
    address: u16,
}

impl Pin for GpioPin {
    /// Creates a new instance of Pin at the given address (pin number).
    fn new(address: u16) -> Self {
        Self { address }
    }

    /// Removes access to the pin from userspace.
    fn tear_down(&self) {
        self.unexport()
            .expect("Unexpected failure to tear down pin");
    }

    /// Attempts to export the pin. If successful, cleans up by unexporting
    /// the pin and returning an empty Result. Does nothing if the pin is
    /// already exported.
    fn probe(&self) -> io::Result<()> {
        self.safe_export()?;
        self.unexport()
    }

    /// Makes the pin accessible from userspace or does nothing if it's already exported.
    fn set_up(&self) -> io::Result<()> {
        self.safe_export()?;
        self.set_direction_in()
    }

    /// Reads the pin value and returns the boolean inverse of the pin's raw value.
    /// # Example
    /// When the pin's value is b'0', `is_active` returns true.
    fn is_active(&self) -> bool {
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

impl GpioPin {
    // Exports the pin to be globally accessible from userspace. If the pin is already
    // exported, does nothing.
    fn safe_export(&self) -> io::Result<()> {
        log!(EventId::ConnectToGpioPinInit, "Exporting pin {}", self);
        if let Err(error) = self.export() {
            // When the pin is already exported we expect io::ErrorKind::ResourceBusy.
            // ResourceBusy is unstable so we unconditionally attempt unexport + rexport.
            // https://github.com/rust-lang/rust/issues/86442
            log!(
                EventId::Info,
                "Error when exporting pin {}: {}. Attempting to unexport and re-export.",
                self,
                error
            );

            self.unexport()?;
            self.export()?;
        }

        log!(
            event_id: EventId::ConnectToGpioPinComplete,
            disposition: vx_logging::Disposition::Success,
            message: format!("Successfully exported pin {}", self)
        );
        Ok(())
    }

    // Exports the pin to be globally accessible from userspace. Returns an error if the
    // pin has already been exported.
    fn export(&self) -> io::Result<()> {
        fs::write(EXPORT_PIN_FILEPATH, self.to_string())?;
        // Without this delay subsequent pin operations may fail with a permission error
        sleep(EXPORT_DELAY);
        Ok(())
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
}

impl fmt::Display for GpioPin {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.address)
    }
}
