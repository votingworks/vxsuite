# usb-drive

A library for interacting with a USB drive. Intended to be used by app backends.

A few things to note:

- The library only supports interacting with a single USB drive at a time (since
  our machines should only ever have one USB drive plugged in at a time).
- The library will automatically mount the USB drive if it is not already
  mounted.

## CLI

You can use `./bin/usb-drive <command>` to play with the API. Run
`./bin/usb-drive` to see the available commands.
