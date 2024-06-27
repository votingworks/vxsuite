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

```
// From apps/mark-scan/fai-100-controller
sudo ./target/release/fai-100-controllerd
```
