use std::{thread, time::Duration};

use uinput::{
    event::{keyboard, Keyboard},
    Device,
};

const UINPUT_PATH: &str = "/dev/uinput";

#[derive(Debug, num_enum::TryFromPrimitive, PartialEq, Eq)]
#[repr(u8)]
pub enum Button {
    RateUp = 0x00,
    RateDown = 0x01,
    Select = 0x02,
    VolumeUp = 0x03,
    VolumeDown = 0x04,
    Right = 0x05,
    Left = 0x06,
    Up = 0x07,
    Down = 0x08,
    Help = 0x09,
    Pause = 0x0A,
}

#[derive(Debug, num_enum::TryFromPrimitive)]
#[repr(u8)]
pub enum Action {
    Released = 0x00,
    Pressed = 0x01,
}

pub trait VirtualKeyboard {
    fn send_keystroke(
        &mut self,
        key: keyboard::Key,
        modifiers: &[keyboard::Key],
    ) -> Result<(), uinput::Error>;
}

impl VirtualKeyboard for Device {
    fn send_keystroke(
        &mut self,
        key: keyboard::Key,
        modifiers: &[keyboard::Key],
    ) -> Result<(), uinput::Error> {
        for modifier in modifiers {
            self.press(modifier)?;
        }
        self.click(&key)?;
        for modifier in modifiers {
            self.release(modifier)?;
        }
        self.synchronize()?;
        Ok(())
    }
}

pub fn create_keyboard(name: &str) -> color_eyre::Result<impl VirtualKeyboard> {
    let keyboard = uinput::open(UINPUT_PATH)?
        .name(name)?
        .event(Keyboard::All)?
        .create()?;
    // Wait for virtual device to register
    thread::sleep(Duration::from_secs(1));
    Ok(keyboard)
}
