# Dev Dock

The dev dock is an on-screen interface for interacting with useful dev tools,
such as mock hardware and taking screenshots.

## Setup

To enable USB drive mocks to work without having to enter your password, add the following to your `/etc/sudoers` file:

```
<your username> ALL=(root:ALL) NOPASSWD: /path/to/vxsuite/libs/usb-mocking/*
```


## Usage

Set environment variable `REACT_APP_VX_ENABLE_DEV_DOCK=TRUE` enable the dev dock. It is enabled by default in development mode.
