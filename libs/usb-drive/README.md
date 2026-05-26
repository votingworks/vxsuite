# usb-drive

A library for interacting with a USB drive. Intended to be used by app backends.

A few things to note:

- The library only supports interacting with a single USB drive at a time (since
  our machines should only ever have one USB drive plugged in at a time).
- The library will automatically mount the USB drive if it is not already
  mounted.

## Setup

In order for this library to work, it will need `sudo` access to two scripts:
`scripts/mount.sh` and `scripts/unmount.sh`. You can set this up by adding the
following to your `/etc/sudoers` file:

```
<username> ALL=(root:ALL) NOPASSWD: /path/to/vxsuite/libs/usb-drive/scripts/*.sh
```

If you are using this with a typical Linux desktop environment like Gnome or
KDE, you'll likely want to run `sudo scripts/disable_automount.sh` to prevent
the desktop environment from mounting disks in a way that interferes with
VxSuite's automatic USB disk handling.

You'll also want to create the `vx-services` user and `vx-group` group like so:

```sh
# 1. Group first
getent group vx-group >/dev/null || sudo groupadd --system vx-group

# 2. System user — no home, no login shell
getent passwd vx-services >/dev/null || \
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin vx-services

# 3. Put vx-services in vx-group
sudo usermod -aG vx-group vx-services

# 4. Put yourself in vx-group so the dev backend (running as $USER) can
#    read/write USB contents
sudo usermod -aG vx-group "$USER"
```

Be sure to log out and back in after running those commands.

## CLI

You can use `./bin/usb-drive <command>` to play with the API. Run
`./bin/usb-drive` to see the available commands.

## Debugging

Set `DEBUG=usb-drive` to see debug logs.
