# Cino Fuzzyscan S680 Barcode Scanner Daemon

## Usage

Running the first time requires [device configuration](#Device Configuration)
and [permission configuration](#Permission Configuration).

```
make build
make run
```

## Permission Configuration

```
# /etc/udev/rules.d/98-cino-s680-barcode-scanner.rules
# Creates a stable address for the serialport device at `/dev/barcode_scanner`. Needed for `serialport` crate to access device.
SUBSYSTEM=="tty", ACTION=="add", KERNEL=="ttyACM[0-9]*", ATTRS{idVendor}=="1fbb", ATTRS{idProduct}=="3850", MODE="0660", GROUP="dialout", SYMLINK+="barcode_scanner"
```

Apply the `udev` rules:

```
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Add your user to the `plugdev` and `dialout` groups:

```
sudo usermod -a -G plugdev $USER
sudo usermod -a -G dialout $USER
# Apply group changes, or log out and log in again
su - $USER
```

## Overview

At a high level the daemon

1. Resets the device
2. Connects to the device
3. Opens a Unix domain socket (UDS) to communicate scan data to the app's `node`
   backend
4. Reads data from the device, parses to
   [AAMVA](https://www.aamva.org/getmedia/99ac7057-0f4d-4461-b0a2-3a5532e1b35c/AAMVA-2020-DLID-Card-Design-Standard.pdf)
   format, and writes serialized JSON to the UDS for consumption by the app
   backend
