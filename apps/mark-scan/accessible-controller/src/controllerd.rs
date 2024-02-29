use std::{thread, time::Duration};

use uinput::{
    event::{keyboard, Keyboard},
    Device,
};
use vx_logging::{log, set_app_name, Disposition, EventId, EventType};

const APP_NAME: &str = "vx-mark-scan-controller-daemon";
const INTERVAL: Duration = Duration::from_millis(1000);
const UINPUT_PATH: &str = "/dev/uinput";

fn send_key(device: &mut Device, key: keyboard::Key) -> Result<(), uinput::Error> {
    device.click(&key)?;
    device.synchronize()?;
    Ok(())
}
fn main() {
    set_app_name(APP_NAME);
    log!(EventId::ProcessStarted, "sendkey started");

    // Create virtual device for keypress events
    log!(
        EventId::CreateVirtualUinputDeviceInit;
        EventType::SystemAction
    );
    let mut device = uinput::open(UINPUT_PATH)
        .unwrap()
        .name("Accessible Controller Daemon Virtual Device")
        .unwrap()
        .event(Keyboard::All)
        .unwrap()
        .create()
        .unwrap();
    // Wait for virtual device to register
    thread::sleep(Duration::from_secs(1));
    log!(
        event_id: EventId::CreateVirtualUinputDeviceComplete,
        disposition: Disposition::Success,
        event_type: EventType::SystemAction
    );

    loop {
        let key = keyboard::Key::Dot;
        if let Err(err) = send_key(&mut device, key) {
            log!(EventId::UnknownError, "Error sending key: {err}");
        } else {
            log!(EventId::Info, "Sent key");
        }
        thread::sleep(INTERVAL);
    }
}
