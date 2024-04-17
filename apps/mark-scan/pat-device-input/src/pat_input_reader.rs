use std::{fmt, io};
use vx_logging::{log, EventId};

use crate::pin::Pin;

// Debian 12 will offset pin addresses by 512.
// eg. the is_connected pin is 478 + 512 = 990
// Even though prod is expected to need the offset, we use the constant
// values below because
// 1. These are the documented values
// 2. Starting low and adding the offset instead of starting high and
//    subtracting the offset means we don't have to worry about
//    pin addresses < 0
const POSSIBLE_PIN_OFFSET: u16 = 512;
const IS_CONNECTED_PIN_ADDRESS: u16 = 478;
const SIGNAL_A_PIN_ADDRESS: u16 = 481;
const SIGNAL_B_PIN_ADDRESS: u16 = 476;

pub struct PatInputReader<T: Pin> {
    is_connected_pin: Option<T>,
    signal_a_pin: Option<T>,
    signal_b_pin: Option<T>,
}

impl<T: Pin> PatInputReader<T> {
    pub fn new() -> Self {
        Self {
            is_connected_pin: None,
            signal_a_pin: None,
            signal_b_pin: None,
        }
    }

    pub fn connect(&mut self) -> Result<(), io::Error> {
        // Prod is expected to use the offset so attempt with offset first.
        let offsets = &[POSSIBLE_PIN_OFFSET, 0];
        let mut offset: Option<u16> = None;
        for &potential_offset in offsets {
            let pin_to_probe = T::new(IS_CONNECTED_PIN_ADDRESS + potential_offset);
            match pin_to_probe.probe() {
                Err(err) => log!(
                    EventId::Info,
                    "Failed to connect to pin {pin_to_probe} with error {err}.",
                ),
                Ok(()) => {
                    log!(EventId::Info, "Valid offset found: {potential_offset}");
                    offset = Some(potential_offset);
                    break;
                }
            }
        }

        match offset {
            None => Err(io::Error::new(
                io::ErrorKind::ConnectionRefused,
                format!("Unable to connect to probe pins at offsets: {:?}", offsets),
            )),
            Some(confirmed_offset) => {
                let is_connected_pin = T::new(IS_CONNECTED_PIN_ADDRESS + confirmed_offset);
                let signal_a_pin = T::new(SIGNAL_A_PIN_ADDRESS + confirmed_offset);
                let signal_b_pin = T::new(SIGNAL_B_PIN_ADDRESS + confirmed_offset);
                is_connected_pin.set_up()?;
                signal_a_pin.set_up()?;
                signal_b_pin.set_up()?;

                self.is_connected_pin = Some(is_connected_pin);
                self.signal_a_pin = Some(signal_a_pin);
                self.signal_b_pin = Some(signal_b_pin);

                Ok(())
            }
        }
    }

    pub fn tear_down(&self) {
        if let Some(pin) = &self.is_connected_pin {
            pin.tear_down();
        }
        if let Some(pin) = &self.signal_a_pin {
            pin.tear_down();
        }
        if let Some(pin) = &self.signal_b_pin {
            pin.tear_down();
        }
    }

    pub fn is_connected(&self) -> bool {
        match &self.is_connected_pin {
            Some(pin) => pin.is_active(),
            None => false,
        }
    }

    pub fn is_signal_a_active(&self) -> bool {
        match &self.signal_a_pin {
            Some(pin) => pin.is_active(),
            None => false,
        }
    }

    pub fn is_signal_b_active(&self) -> bool {
        match &self.signal_b_pin {
            Some(pin) => pin.is_active(),
            None => false,
        }
    }
}

struct MockPin {
    address: u16,
    active: bool,
    probe_error: Option<io::Error>,
}

impl Pin for MockPin {
    fn new(address: u16) -> Self {
        MockPin {
            address,
            active: false,
            probe_error: None,
        }
    }

    fn probe(&self) -> Result<(), io::Error> {
        if let Some(probe_error) = &self.probe_error {
            // io::Error doesn't implement clone()
            return Err(io::Error::new(probe_error.kind(), probe_error.to_string()));
        }
        Ok(())
    }

    fn set_up(&self) -> Result<(), io::Error> {
        Ok(())
    }

    fn tear_down(&self) {}

    fn is_active(&self) -> bool {
        self.active
    }
}

impl fmt::Display for MockPin {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.address)
    }
}

// Fails to probe for any address that uses the offset
struct MockNoOffsetPin {
    address: u16,
    active: bool,
    probe_error: Option<io::Error>,
}

impl Pin for MockNoOffsetPin {
    fn new(address: u16) -> Self {
        let mut probe_error = None;
        if address > POSSIBLE_PIN_OFFSET {
            probe_error = Some(io::Error::new(
                io::ErrorKind::AddrNotAvailable,
                "Test error",
            ))
        }

        MockNoOffsetPin {
            address,
            active: false,
            probe_error,
        }
    }

    fn probe(&self) -> Result<(), io::Error> {
        if let Some(probe_error) = &self.probe_error {
            // io::Error doesn't implement clone()
            return Err(io::Error::new(probe_error.kind(), probe_error.to_string()));
        }
        Ok(())
    }

    fn set_up(&self) -> Result<(), io::Error> {
        Ok(())
    }

    fn tear_down(&self) {}

    fn is_active(&self) -> bool {
        self.active
    }
}

impl fmt::Display for MockNoOffsetPin {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.address)
    }
}

#[cfg(test)]
mod tests {
    use vx_logging::set_app_name;

    use super::*;

    fn get_default_mocked_reader() -> PatInputReader<MockPin> {
        let mut reader: PatInputReader<MockPin> = PatInputReader::new();
        reader.connect().unwrap();
        reader
    }

    #[test]
    fn test_connect_offset() {
        set_app_name("test");
        let reader = get_default_mocked_reader();

        assert_eq!(
            reader.is_connected_pin.unwrap().address,
            IS_CONNECTED_PIN_ADDRESS + POSSIBLE_PIN_OFFSET
        );
        assert_eq!(
            reader.signal_a_pin.unwrap().address,
            SIGNAL_A_PIN_ADDRESS + POSSIBLE_PIN_OFFSET
        );
        assert_eq!(
            reader.signal_b_pin.unwrap().address,
            SIGNAL_B_PIN_ADDRESS + POSSIBLE_PIN_OFFSET
        );
    }

    #[test]
    fn test_connect_no_offset() {
        set_app_name("test");
        let mut reader: PatInputReader<MockNoOffsetPin> = PatInputReader::new();
        reader.connect().unwrap();
        assert_eq!(
            reader.is_connected_pin.unwrap().address,
            IS_CONNECTED_PIN_ADDRESS
        );
        assert_eq!(reader.signal_a_pin.unwrap().address, SIGNAL_A_PIN_ADDRESS);
        assert_eq!(reader.signal_b_pin.unwrap().address, SIGNAL_B_PIN_ADDRESS);
    }

    #[test]
    fn test_is_connected() {
        let mut reader = get_default_mocked_reader();

        assert!(!reader.is_connected());
        reader.is_connected_pin.as_mut().unwrap().active = true;
        assert!(reader.is_connected());
    }

    #[test]
    fn test_signal_a() {
        let mut reader = get_default_mocked_reader();

        assert!(!reader.is_signal_a_active());
        reader.signal_a_pin.as_mut().unwrap().active = true;
        assert!(reader.is_signal_a_active());
    }

    #[test]
    fn test_signal_b() {
        let mut reader = get_default_mocked_reader();

        assert!(!reader.is_signal_b_active());
        reader.signal_b_pin.as_mut().unwrap().active = true;
        assert!(reader.is_signal_b_active());
    }
}
