use std::{thread, time::Duration};

use uinput::{
    event::{keyboard, Keyboard},
    Device,
};

const UINPUT_PATH: &str = "/dev/uinput";

#[derive(Debug, num_enum::TryFromPrimitive, PartialEq, Eq)]
#[repr(u8)]
/// An action triggerable by the user. Describes the button or sip & puff action
/// that has changed, but not the value of the signal.
pub enum Signal {
    Help = 0x30,
    VolumeDown = 0x31,
    Down = 0x32,
    RateDown = 0x33,
    Left = 0x34,
    Select = 0x35,
    Right = 0x36,
    VolumeUp = 0x37,
    Up = 0x38,
    RateUp = 0x39,
    Play = 0x3a,
    Pause = 0x3b,
    Sip = 0x2b,
    Puff = 0x2f,
    SipAndPuffConnection = 0x2e,
    NoOp = 0x00,
}

#[derive(Debug, num_enum::TryFromPrimitive)]
#[repr(u8)]
/// The status of the action described by Signal.
/// Examples:
/// { Action = 0x37, ActionStatus = 0x01 } - voter has pressed the "Volume Up" button
/// { Action = 0x37, ActionStatus = 0x00 } - voter has released the "Volume Up" button
///
/// { Action = 0x2b, ActionStatus = 0x01 } - voter has started sipping on a sip & puff
/// { Action = 0x2b, ActionStatus = 0x00 } - voter has stopped sipping
///
/// { Action = 0x2e, ActionStatus = 0x01 } - a sip & puff device was plugged in
/// { Action = 0x2e, ActionStatus = 0x00 } - the sip & puff device was disconnected
pub enum Status {
    Idle = 0x00,
    Active = 0x01,
}

#[derive(Debug, num_enum::TryFromPrimitive)]
#[repr(u8)]
pub enum SipAndPuffSignalStatusChanged {
    Sip = 0x2b,
    Puff = 0x2f,
    NoChange = 0x00,
}

#[derive(Debug, num_enum::TryFromPrimitive)]
#[repr(u8)]
pub enum SipAndPuffSignalStatus {
    Executed = 0x01,
    Idle = 0x00,
}

#[derive(Debug, num_enum::TryFromPrimitive)]
#[repr(u8)]
pub enum SipAndPuffConnectionStatusChanged {
    Changed = 0x2e,
    NoChange = 0x00,
}

#[derive(Debug, num_enum::TryFromPrimitive)]
#[repr(u8)]
pub enum SipAndPuffConnectionStatus {
    Connected = 0x01,
    NotConnected = 0x00,
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
