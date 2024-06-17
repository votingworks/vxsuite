# Accessible controller daemon

The accessible controller daemon listens for incoming signal from the VSAP 155 accessible controller. It receives button press events and emits keyboard keypress events to be consumed by the frontend.

## Overview

The daemon:

1. Connects to the accessible controller at /dev/ttyACM1 via serial port
2. Listens in a loop for button press signal from the device
3. When button signal is received, emits the corresponding keypress event using `uinput`

## Usage

To build:

```
cd apps/mark-scan/accessible-controller
make build
```

To run:

```
// From apps/mark-scan/accessible-controller
sudo ./target/release/controllerd
```

To test:

```
sudo -E /home/vx/.cargo/bin/cargo test
```

`sudo` is needed for the last 2 commands to access `/dev/uinput` and `/dev/tty*`. udev rule configuration is on the backlog.

