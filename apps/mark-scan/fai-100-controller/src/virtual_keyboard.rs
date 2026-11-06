use std::{io, thread, time::Duration};

use evdev::{AttributeSet, BusType, InputId, KeyCode, KeyEvent, uinput::VirtualDevice};

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
