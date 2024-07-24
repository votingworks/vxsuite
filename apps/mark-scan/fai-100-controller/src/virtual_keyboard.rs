use std::{thread, time::Duration};

use uinput::{
    event::{keyboard, Keyboard},
    Device,
};

const UINPUT_PATH: &str = "/dev/uinput";

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
