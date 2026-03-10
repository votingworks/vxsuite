# Multiple USB Drive Support

**Author:** @eventualbuddha

**Status:** `implementing`

## Existing Discussion

This work was planned as part of Election Archiving & Backup (#7897), which
requires the ability to reference multiple USB drives simultaneously: one for
backup and one for normal data transfer. It also enables future features such as
Multi-Station Adjudication (see
[spec 0002](0002-multi-station-adjudication.md)), which may want to import CVRs
from multiple USB drives connected to the main VxAdmin instance (the Host).

The dev-dock mock file isolation work ([spec 0003](0003-dev-dock-isolation.md))
is a prerequisite, as its unified `.mock-state/<NODE_ENV>/` directory tree is
extended here to support per-drive mock state directories.

## Problem

VxSuite's USB drive abstraction (`UsbDrive` in `@votingworks/usb-drive`) models
a single plugged-in drive. It exposes a `status()` method that returns a
`UsbDriveStatus` (`no_drive`, `mounted`, `ejected`, `error`) and imperative
`eject()`, `format()`, and `sync()` methods.

This single-drive model is insufficient for:

1. **Election Archiving & Backup**, which needs to write to multiple drives at
   once (e.g., a primary data transfer drive and a backup drive).
2. **Multi-Station Adjudication**, where a host VxAdmin may import CVR data from
   multiple USB drives concurrently.

Additionally, the existing implementation conflated USB drive detection, mount
management, and the single-drive abstraction into one large module, making it
hard to extend.

## Proposal

### New `MultiUsbDrive` interface

Introduce a `MultiUsbDrive` interface in `@votingworks/usb-drive` that tracks
all connected USB drives and their partition state:

```typescript
// libs/usb-drive/src/multi_usb_drive.ts

export interface UsbPartitionInfo {
  devPath: string; // e.g. '/dev/sdb1'
  label?: string;
  fstype?: string;
  fsver?: string;
  mount: UsbPartitionMount; // 'unmounted' | 'mounting' | 'mounted' | 'unmounting'
}

export interface UsbDriveInfo {
  devPath: string; // e.g. '/dev/sdb'
  vendor?: string;
  model?: string;
  serial?: string;
  partitions: UsbPartitionInfo[];
}

export interface MultiUsbDrive {
  getDrives(): UsbDriveInfo[];
  refresh(): Promise<void>;
  ejectDrive(driveDevPath: string): Promise<void>;
  formatDrive(driveDevPath: string): Promise<void>;
  sync(partitionDevPath: string): Promise<void>;
  stop(): void;
}
```

`detectMultiUsbDrive(logger, options?)` creates the real implementation, backed
by `block_devices.ts`. Device enumeration reads `udevadm info --export-db` (to
identify USB block devices and their filesystem attributes without requiring
privileged access) and `/proc/mounts` (to determine current mount points).
Plug/unplug events are detected via `udevadm monitor`. FAT32 partitions are
auto-mounted on detection. Per-drive and per-partition action locks prevent race
conditions between concurrent mount, eject, and format operations.

### Backward-compatible `UsbDriveAdapter`

A `createUsbDriveAdapter(multiUsbDrive, getDriveDevPath)` function wraps a
`MultiUsbDrive` to produce the existing single-drive `UsbDrive` interface.
`getDriveDevPath` is a callback that selects which drive to expose (typically
the first one).

This adapter allows all existing code that depends on `UsbDrive` — exporters,
`listDirectoryOnUsbDrive`, `createSystemCallApi`, and other shared utilities —
to continue working without changes.

### `detectOrMockMultiUsbDrive`

A new `detectOrMockMultiUsbDrive(logger)` function replaces `detectUsbDrive` for
apps migrating to the multi-drive API. It returns the file-backed mock when
`USE_MOCK_USB_DRIVE` is enabled, or the real `detectMultiUsbDrive`
implementation otherwise.

### Admin backend migration

`apps/admin/backend` is the first app to adopt `MultiUsbDrive` as its primary
interface:

- `buildApp` and `start` accept `multiUsbDrive: MultiUsbDrive` instead of
  `usbDrive: UsbDrive`.
- Internally, a `UsbDriveAdapter` is created to pass to legacy-API utilities.
- The API gains a `getUsbDrives()` method that returns all `UsbDriveInfo[]`
  (replacing `getUsbDriveStatus()`).
- `ejectUsbDrive` and `formatUsbDrive` now take a `driveDevPath` parameter to
  target a specific drive.

### Admin frontend

- `getUsbDrives` replaces `getUsbDriveStatus` in `api.ts`, returning
  `UsbDriveInfo[]` with a 1-second poll interval.
- A new `getUsbDriveStatus(usbDrives: UsbDriveInfo[]): AdminUsbDriveStatus`
  utility in `src/utils/get_usb_drive_status.ts` converts the drive list to the
  legacy status enum for screens that only need to know about a single drive.
- All mutation calls (`ejectUsbDrive`, `formatUsbDrive`) pass `driveDevPath`.
- `AppContext` carries `usbDrives: UsbDriveInfo[]` instead of
  `usbDriveStatus: UsbDriveStatus`.

### Dev dock: multiple drive slots

The dev dock gains first-class support for simulating multiple USB drives:

**Backend (`dev_dock_api.ts`)**:

- `getUsbDriveStatus()` returns `DevDockUsbDriveInfo[]` (one entry per mock
  drive), replacing the single-status response.
- New `addUsbDriveSlot()` creates a new mock drive directory and returns its
  `devPath`.
- New `removeUsbDriveSlot({ devPath })` deletes the mock drive directory.
- `insertUsbDrive({ devPath })` and `removeUsbDrive({ devPath })` now take a
  `devPath` to target a specific slot.
- On startup, if no mock drives exist, one is created automatically so
  development continues to work without manual setup.

**Frontend (`dev_dock.tsx`)**:

- The USB section renders one drive widget per slot, each with its own
  insert/remove/clear controls.
- A "+" button adds a new drive slot (disabled when at max drives).
- A "×" button per slot removes that slot.
- Drive device paths are shown as labels (e.g. `/dev/sdb`).
- Drive state is polled at 1-second intervals to reflect changes made by running
  apps.

### Mock updates

**`createMockFileMultiUsbDrive()`** — the file-backed mock used in development
and integration tests. Drive state is stored under
`.mock-state/<NODE_ENV>/usb-drive/usb-drive/<diskName>/` (leveraging the unified
mock-state root from spec 0003). Helper functions:

- `addMockDrive()` — creates a new drive directory, returns its path.
- `listMockDrives()` — lists currently registered drives.
- `removeMockDriveDir(drivePath)` — deletes a drive directory.
- `getMockFileUsbDriveHandler()` — returns a per-drive handler for
  insert/remove/clear operations, used by the dev dock backend.

**`createMockMultiUsbDrive()`** — the in-memory mock used in unit tests. Wraps
each `MultiUsbDrive` method as a `mockFunction` for strict call expectations.
Includes `insertUsbDrive(contents)` and `removeUsbDrive()` helpers that
configure `getDrives` with appropriate fake `UsbDriveInfo`. Also exposes a
`usbDrive: UsbDrive` adapter for code that still uses the legacy interface.

## Alternatives Considered

**Keep the single-drive API and add a parallel multi-drive API.** Having both
`UsbDrive` and `MultiUsbDrive` as first-class production interfaces long-term
would create confusion and duplicated code. The adapter pattern bridges the gap
during migration, and eventually `UsbDrive` can be removed.

**Pass `MultiUsbDrive` only where multi-drive behavior is needed.** This would
require the least change in the short term, but would leave most of the codebase
on the legacy API and make it hard to surface multi-drive status consistently
(e.g., showing all drives in the navigation bar).

## Open Questions

- Should other apps (VxCentralScan, VxScan) also migrate to `MultiUsbDrive`?
  Currently only VxAdmin is migrated. The adapter makes it easy to defer this
  until those apps need multi-drive behavior.
- Should `getUsbDrives()` replace `getUsbDriveStatus()` in all apps' APIs, or
  only in VxAdmin? The `getUsbDriveStatus` utility function provides a low-cost
  bridge for apps that currently don't need multi-drive awareness.
