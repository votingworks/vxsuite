# scan-diagnostic

Internal tool for diagnosing scan issues.

## Usage

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run the following command:

```sh
pnpm start
```

This will start the server with the default scan workspace. You can also specify
a different workspace with the `SCAN_WORKSPACE` environment variable.

```sh
SCAN_WORKSPACE=/path/to/scan-workspace pnpm start
```

This may be an unzipped backup file or a regular scan workspace directory.

### Navigation

Launch the app in your browser at whatever vite prints to the terminal (likely
http://localhost:5173). You'll see two ballot images for the first scanned sheet
with scores and bubbles overlaid. To move between ballot sheets, use the right
and left arrow keys on the keyboard. If the ballot images are upside-down, click
the "Rotate" button in the top right corner. If the ballot images are in the
wrong order, click the "Swap" button in the top right corner.

## License

GPLv3
