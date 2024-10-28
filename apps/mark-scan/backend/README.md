# VxMarkScan Backend

Backend server for the VxMarkScan ballot marking app.

## Setup

Follow the instructions in the [VxSuite README](../../../README.md)

You generally should not need to run the backend directly. Instead, run the
frontend, which will automatically run the backend.

```sh
cd apps/mark-scan/frontend
pnpm start
```

## PAT Inputs

For the backend to recognize the USB PAT switch you may need to extend your udev
rules. Create or edit `/etc/udev/rules.d/50-usb-hid.rules` with:

```
SUBSYSTEM=="input", GROUP="input", MODE="0666"
SUBSYSTEM=="usb", ATTR{idVendor}=="0a95", ATTR{idProduct}=="0012", MODE="0666", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0a95", ATTRS{idProduct}=="0012", MODE="0666", GROUP="plugdev"
```

then run

```
sudo udevadm control --reload-rules && sudo udevadm trigger
```

To work on production hardware with the built-in 3.5mm PAT input, you'll need to
run `./backend/build/patinputd` in the background or a separate terminal. There
are no build steps for this tool besides
`cd apps/mark-scan/backend && pnpm build`.

You may need to run the daemon with sudo in development.

## Accessible Controller

A daemon is needed to use the built in accessible controller.

To build it, run `cargo build` from `apps/mark-scan/accessible-controller`. Then
from `vxsuite` root run `./target/debug/controllerd`.

You may need to run the daemon with sudo in development.

## Testing

```sh
pnpm test
```
