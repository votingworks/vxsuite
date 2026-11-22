# Configuration package rename: before and after

Screens whose user-facing copy changes when VxAdmin's signed export is renamed
the "configuration package". Before is `main`; after is
`copy/configuration-package`.

Both passes were captured against the same pinned vxsuite checkout with mocked
backends (the `vxsuite-screenshots` suites), so the only difference between a
pair is the copy change itself. Capacity and error states that no suite reaches
were produced by intercepting the relevant API responses: a 5.0 GB package
against a 4.0 GB file limit, a 1.0 GB free drive, a 2.0 GB drive, and each
configuration error in turn.

The rule: VxHub exports an **election package** that is loaded into VxAdmin;
VxAdmin exports a **configuration package** that configures every other machine.

## VxAdmin — saving the package

| File | Screen |
| --- | --- |
| `cfgpkg-01-button.png` | Election screen, the save button |
| `cfgpkg-02-confirm-modal.png` | Save confirmation |
| `cfgpkg-03-saved.png` | Saved |
| `cfgpkg-04-no-usb.png` | No USB drive |
| `cfgpkg-05-file-too-large.png` | Package too large for the filesystem |
| `cfgpkg-06-insufficient-space.png` | Not enough space free |
| `cfgpkg-07-drive-too-small.png` | Drive too small |
| `cfgpkg-08-save-failed.png` | Save failed |

## The configuration screen — VxScan standing in

One shared component in `libs/ui` renders this screen on VxScan, VxMark,
VxMarkScan, VxCentralScan and VxPrint, so the wording changes on all five at
once.

| File | Screen |
| --- | --- |
| `cfgpkg-10-insert-usb.png` | Waiting for the USB drive |
| `cfgpkg-11-no-package.png` | No package on the drive |
| `cfgpkg-12-auth-error.png` | Authentication failed |
| `cfgpkg-13-key-mismatch.png` | Wrong election |
| `cfgpkg-14-no-ballots.png` | No ballots in the package |

The sixth message on that screen, "Insert an election manager card before
configuring.", never named the package and is byte-identical before and after,
so it is not included here.

## VxMark and VxPrint

| File | Screen |
| --- | --- |
| `cfgpkg-20-mark-no-test-ballots.png` | VxMark election manager menu |
| `cfgpkg-30-print-settings-no-test-ballots.png` | VxPrint settings, ballot mode toggle |
| `cfgpkg-31-print-test-decks-callout.png` | VxPrint test decks |
