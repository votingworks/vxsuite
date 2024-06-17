# Accessible controller daemon

The accessible controller daemon listens for incoming signal from the VSAP 150
accessible controller. It receives button press and sip & puff events and emits
keyboard keypress events to be consumed by the frontend.

## Usage in dev

To build:

```
cd apps/mark-scan/fai-100-controller
make build
```

To run:

First ensure you have a udev rule granting `uinput` permission
([example](https://github.com/votingworks/vxsuite-complete-system/pull/367/files#diff-50733779da0c9503b7a83caae7825d6c540b10d4ca6f62c53789d2bb25c52752R1)),
then add your user to the group.

```
sudo usermod -aG uinput vx
```

`vxdev` will already have this udev rule defined but will still need to run the
`usermod` command.

```
// From apps/mark-scan/fai-100-controller
MARK_SCAN_WORKSPACE=/path/to/dev-workspace ./target/release/fai-100-controllerd
```
