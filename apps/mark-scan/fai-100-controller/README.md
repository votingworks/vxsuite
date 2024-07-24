# Accessible controller daemon

The accessible controller daemon listens for incoming signal from the VSAP 150
accessible controller. It receives button press and sip & puff events and emits
keyboard keypress events to be consumed by the frontend.

## Usage in dev

### Set up groups and udev rules

First ensure you have two udev rules granting group permission to `uinput` and
the `FAI-100` device. Edit or create relevant files in `/etc/udev/rules.d` eg.
[`/etc/udev/rules.d/50-uinput.rules`](https://github.com/votingworks/vxsuite-complete-system/blob/main/config/50-uinput.rules)
and
[`/etc/udev/rules.d/55-fai100.rules`](https://github.com/votingworks/vxsuite-complete-system/blob/main/config/55-fai100.rules).

Ensure those groups exist and then add your user to the groups.

```
getent group uinput || groupadd uinput
getent group fai100 || groupadd fai100
sudo usermod -aG uinput,fai100 vx
```

`vxdev` images will already have the necessary groups and udev rules but you
will still need to run `usermod`.

### Building

```
cd apps/mark-scan/fai-100-controller
make build
```

### Running

```
// From apps/mark-scan/fai-100-controller
MARK_SCAN_WORKSPACE=/path/to/dev-workspace ./target/release/fai-100-controllerd
```
