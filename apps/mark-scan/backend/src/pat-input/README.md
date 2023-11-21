# PAT Input

Personal Assistive Technology (PAT) devices are used by people to send 2 or more
signals to computers. A PAT device may be used on the hardware by plugging the
PAT device into the front right 3.5mm jack.

VxMarkScan hardware supports only 2-signal devices. As this integration is
device-agnostic, we call these signals "A" and "B". The signals commonly map to
user actions of "sip" and "puff" on a
[sip and puff device](https://accessibleweb.com/assistive-technologies/assistive-technology-focus-sip-and-puff-devices/).

# Building and running the daemon

To get the PAT input working, run:

```
cd /apps/mark-scan/backend
pnpm build
sudo ./bin/patinputd
```

udev rule configuration to allow running the daemon without `sudo` is on the
backlog.

The daemon must be running for `connection_status_reader` to work. Otherwise it
will fail because the pin will be unexported.

## Data Format and Protocol

Three status bits can be read from the 3.5mm jack:

1. Device connection status - is a PAT device plugged in?
2. "A" signal - is the user currently triggering their "A" input?
3. "B" signal - is the user currently triggering their "B" input?

These bits are communicated through
[GPIO](https://en.wikipedia.org/wiki/General-purpose_input/output). From the
software perspective, GPIO pins may be thought of as shared registers for the
3.5mm jack to communicate with the OS.

There are several ways for software to read GPIO values. This integration uses
the [sysfs](https://www.ics.com/blog/gpio-programming-using-sysfs-interface)
interface.

## Implementation Overview

This integration has 2 responsibilities:

1. Communicate with the OS to read GPIO pins that contain PAT device data
2. Send that data to VxMarkScan

### Structure

`patinputd.c` is a daemon that reads "A" and "B" signal and sends keypresses for
mark-scan frontend to handle. More specifically, it

- Sets itself up to read GPIO pins and send keypress events
- Polls GPIO pin data in a loop
- When "A" or "B" signal is received, emits a keypress event
- Cleans up on exit

`connection_status_reader.ts` is a small node helper that reads PAT device
connection status. It's used by the VxMarkScan backend.

### Reading PAT device data

The aforementioned `sysfs` interface makes GPIO pin data available to userspace
via the filesystem at `/sys/class/gpio`. The pattern for querying this data is
below. Each step involves writing to or reading from the filesystem.

1. `Export` the desired pin. The pin's value can't be read until it's exported.
2. Set the pin direction. In our case we set it to `input` because data is going
   from pin to software.
3. Read the pin value.
4. When done with all reading, `unexport` the pin. The pin is no longer
   readable.

### Sending data to VxMarkScan frontend

Once `patinputd` has "A" or "B" signal, it sends a keypress event with
[uinput](https://kernel.org/doc/html/v4.12/input/uinput.html). VxMarkScan
listens for keypresses "1" or "2" and handles them as DOM navigation and DOM
element selection, respectively.
