use std::{io, thread, time::Duration};

use evdev::{AttributeSet, BusType, InputId, KeyCode, KeyEvent, uinput::VirtualDevice};

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
    fn send_keystroke(&mut self, key: KeyCode, modifiers: &[KeyCode]) -> io::Result<()>;
}

impl VirtualKeyboard for VirtualDevice {
    fn send_keystroke(&mut self, key: KeyCode, modifiers: &[KeyCode]) -> io::Result<()> {
        let events: Vec<_> = modifiers
            .iter()
            .map(|&modifier| *KeyEvent::new(modifier, 1))
            .chain([*KeyEvent::new(key, 1), *KeyEvent::new(key, 0)])
            .chain(
                modifiers
                    .iter()
                    .map(|&modifier| *KeyEvent::new(modifier, 0)),
            )
            .collect();
        self.emit(&events)
    }
}

pub fn create_keyboard(name: &str) -> color_eyre::Result<impl VirtualKeyboard + use<>> {
    let keys: AttributeSet<KeyCode> = (KeyCode::KEY_ESC.0..=KeyCode::KEY_MICMUTE.0)
        .map(KeyCode)
        .collect();
    let keyboard = VirtualDevice::builder()?
        .name(name)
        .input_id(InputId::new(BusType(0), 0, 0, 0))
        .with_keys(&keys)?
        .build()?;
    // Wait for virtual device to register
    thread::sleep(Duration::from_secs(1));
    Ok(keyboard)
}
