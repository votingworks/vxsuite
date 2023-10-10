# VxMarkScan Backend

Backend server for the VxMarkScan ballot marking app.

## Setup

Follow the instructions in the [VxSuite README](../../../README.md)

You generally should not need to run the backend directly. Instead, run the
frontend, which will automatically run the backend.

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

```sh
cd apps/mark/frontend
pnpm start
```

## Testing

```sh
pnpm test
```

## License

GPLv3
