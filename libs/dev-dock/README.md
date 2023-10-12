# Dev Dock

The dev dock is an on-screen interface for interacting with useful dev tools,
such as mock hardware and taking screenshots.

## Usage

Set environment variable `REACT_APP_VX_ENABLE_DEV_DOCK=TRUE` to enable the dev
dock. It is enabled by default in development mode.

In order to use the mock smart cards and mock USB drive, you need to set
`REACT_APP_VX_USE_MOCK_CARDS=TRUE` and `REACT_APP_VX_USE_MOCK_USB_DRIVE=TRUE`
respectively. You may do so by creating a `.env.local` file at the root of the
project or workspace.
