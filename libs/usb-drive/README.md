# usb-drive

A library for interacting with a USB drive. Intended to be used by app backends.

A few things to note:

- The library only supports interacting with a single USB drive at a time (since
  our machines should only ever have one USB drive plugged in at a time).
- The library will automatically mount the USB drive if it is not already
  mounted.

## Setup

In order for this library to work, it will need `sudo` access to two scripts:
`src/mount.sh` and `src/unmount.sh`. You can set this up by adding the following
to your `/etc/sudoers` file:

```
<username> ALL=(root:ALL) NOPASSWD: /path/to/vxsuite/libs/usb-drive/src/*.sh
```

## CLI

You can use `./bin/usb-drive <command>` to play with the API. Run
`./bin/usb-drive` to see the available commands.

## Debugging

Set `DEBUG=usb-drive` to see debug logs.
