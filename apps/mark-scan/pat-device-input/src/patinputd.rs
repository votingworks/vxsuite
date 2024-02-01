use std::{
    fs::OpenOptions,
    io::{Read, Write},
    process::exit,
    str::from_utf8,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};
use uinput::{
    event::{keyboard, Keyboard},
    Device,
};
use vx_logging::{
    print_log, set_app_name,
    types::{EventType, Log},
    Disposition, EventId,
};

const UINPUT_PATH: &str = "/dev/uinput";
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const EXPORT_PIN_FILEPATH: &str = "/sys/class/gpio/export";
const APP_NAME: &str = "vx-mark-scan-pat-input-daemon";

enum Pin {
    IsConnected,
    SignalA,
    SignalB,
}

impl Pin {
    const fn as_buf(&self) -> &[u8] {
        match *self {
            Pin::IsConnected => b"478",
            Pin::SignalA => b"481",
            Pin::SignalB => b"476",
        }
    }

    const fn as_str(&self) -> &str {
        match *self {
            Pin::IsConnected => "478",
            Pin::SignalA => "481",
            Pin::SignalB => "476",
        }
    }
}

fn send_key(device: &mut Device, key: keyboard::Key) -> Result<(), uinput::Error> {
    device.click(&key)?;
    device.synchronize().unwrap();
    Ok(())
}

fn create_virtual_device() -> Device {
    uinput::open(UINPUT_PATH)
        .unwrap()
        .name("PAT Input Daemon Virtual Device")
        .unwrap()
        .event(Keyboard::All)
        .unwrap()
        .create()
        .unwrap()
}

fn export_pin(pin: &Pin) -> Result<(), std::io::Error> {
    let mut export_pin_file = OpenOptions::new()
        .write(true)
        .read(false)
        .open(EXPORT_PIN_FILEPATH)?;
    export_pin_file.write(pin.as_buf())?;
    Ok(())
}

fn set_pin_direction_in(pin: &Pin) -> Result<(), std::io::Error> {
    let filepath = format!("/sys/class/gpio/gpio{}/direction", pin.as_str());
    let mut direction_file = OpenOptions::new().write(true).read(false).open(filepath)?;
    direction_file.write(b"in")?;
    Ok(())
}

fn set_up_pin(pin: Pin) -> Result<(), std::io::Error> {
    export_pin(&pin)?;
    set_pin_direction_in(&pin)?;
    Ok(())
}

fn set_up_pins() -> Result<(), std::io::Error> {
    set_up_pin(Pin::IsConnected)?;
    set_up_pin(Pin::SignalA)?;
    set_up_pin(Pin::SignalB)?;
    Ok(())
}

fn read_pin_value_with_result(pin: Pin) -> Result<bool, std::io::Error> {
    let filepath = format!("/sys/class/gpio/gpio{}/value", pin.as_str());
    let mut buf = [0u8; 8];
    let mut value_pin_file = OpenOptions::new().write(false).read(true).open(filepath)?;

    let bytes_read = value_pin_file.read(&mut buf)?;
    // Pin value should be '0' or '1'
    if bytes_read != 1 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Expected exactly 1 byte to be read from GPIO pin but got {bytes_read} bytes"),
        ));
    }

    let string_value = from_utf8(&buf[0..1]).expect("Not UTF-8");
    // Pin status does not follow boolean convention. We translate to typical
    // boolean convention here.
    // 1 is the default state, 0 is actioned state
    // connection status: 1 when PAT device is not plugged in, 0 when plugged in
    // A/B signal: 1 when no signal is sent from device, 0 when signal is sent
    match string_value {
        "0" => Ok(true),
        "1" => Ok(false),
        _ => Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Unexpected non-boolean pin value: {string_value}"),
        )),
    }
}

fn is_pin_active(pin: Pin) -> bool {
    read_pin_value_with_result(pin).unwrap_or_else(|error| {
        print_log(Log {
            event_id: EventId::PatDeviceError,
            message: format!("Error getting GPIO pin value: {error}"),
            ..Default::default()
        });
        false
    })
}

fn main() {
    set_app_name(APP_NAME.to_string());
    print_log(Log {
        event_id: EventId::ProcessStarted,
        event_type: EventType::SystemAction,
        ..Default::default()
    });

    let running = Arc::new(AtomicBool::new(true));

    if let Err(e) = ctrlc::set_handler({
        let running = running.clone();
        move || {
            running.store(false, Ordering::SeqCst);
        }
    }) {
        print_log(Log {
            event_id: EventId::ErrorSettingSigintHandler,
            message: e.to_string(),
            event_type: EventType::SystemStatus,
            ..Default::default()
        });
    }

    // Create virtual device for keypress events
    print_log(Log {
        event_id: EventId::CreateVirtualUinputDeviceInit,
        event_type: EventType::SystemAction,
        ..Default::default()
    });
    let mut device = create_virtual_device();
    // Wait for virtual device to register
    thread::sleep(Duration::from_secs(1));
    print_log(Log {
        event_id: EventId::CreateVirtualUinputDeviceComplete,
        disposition: Disposition::Success,
        event_type: EventType::SystemAction,
        ..Default::default()
    });

    print_log(Log {
        event_id: EventId::ConnectToPatInputInit,
        ..Default::default()
    });

    // Export pins and set direction
    set_up_pins().unwrap_or_else(|error| {
        print_log(Log {
            event_id: EventId::ConnectToPatInputComplete,
            disposition: Disposition::Failure,
            message: format!("An error occurred during GPIO pin connection: {error}"),
            ..Default::default()
        });
    });

    // is_connected is unused for keypresses in this daemon but it's important to export
    // the pin so it can be read by the mark-scan backend
    let is_connected = is_pin_active(Pin::IsConnected);
    let mut signal_a = is_pin_active(Pin::SignalA);
    let mut signal_b = is_pin_active(Pin::SignalB);

    print_log(Log {
        event_id: EventId::ConnectToPatInputInit,
        message: format!("Connected to PAT with initial values [is_connected={is_connected}], [signal_a={signal_a}], [signal_b={signal_b}]"),
        ..Default::default()
    });

    loop {
        if !running.load(Ordering::SeqCst) {
            print_log(Log {
                event_id: EventId::ProcessTerminated,
                event_type: EventType::SystemAction,
                ..Default::default()
            });
            exit(0);
        }

        let new_signal_a = is_pin_active(Pin::SignalA);
        let new_signal_b = is_pin_active(Pin::SignalB);

        if new_signal_a && !signal_a {
            send_key(&mut device, keyboard::Key::_1).unwrap();
        }
        if new_signal_b && !signal_b {
            send_key(&mut device, keyboard::Key::_2).unwrap();
        }

        signal_a = new_signal_a;
        signal_b = new_signal_b;

        thread::sleep(POLL_INTERVAL);
    }
}
