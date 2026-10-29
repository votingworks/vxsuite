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

In order to use the mock printer, you need to set
`REACT_APP_VX_USE_MOCK_PRINTER=TRUE`. Prints are saved to the `dev-workspace`
directory in `libs/fujitsu-thermal-printer` or `libs/printing`.

## Screenshots and Screen Recording

The camera button (or `Super+K`) captures one frame of the app's own page with
`getDisplayMedia` and offers to save it as a PNG to the Downloads folder.

The video button records the app's own page with `getDisplayMedia` and
`MediaRecorder` (mp4 if supported, otherwise webm), streaming it to the backend,
then offers to save it to the Downloads folder. Native windows such as file
dialogs are not captured.

Both require a kiosk-browser that allows the page to capture itself, run with
`--allow-devtools`. In Chrome, pick the current tab when prompted.

While recording, the dock is hidden. `Super+D` still toggles it, and `Ctrl+C` or
`Super+.` stops the recording.
