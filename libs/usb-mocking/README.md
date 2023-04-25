# USB Drive Mocking

The scripts in this library are useful for mocking USB drives in `vxsuite`. The
mock consists of a simple loop device backed by an `.img` file. The contained
filesystem persists and its contents can be separately inspected and
manipulated.

The current iteration of these scripts only supports one virtual USB drive image
at a time. You can reset and resize whenever necessary.

### Insert Drive

"Inserts" the virtual USB drive. Does not mount the drive.

```bash
pnpm usb-insert
```

### Remove Drive

"Removes" the virtual USB drive.

```bash
pnpm usb-remove
```

### Initializing (Resizing)

`pnpm usb-insert` will automatically initialize a 64MB virtual USB drive if none
exists. You can use `pnpm usb-initialize` to create a virtual USB drive of a
different size or simply if you want to wipe the existing filesystem. The script
takes the `-s` flag to indicate the size of the virtual USB drive in megabytes.
The image is not compressed on your device and will take up the equivalent
amount of space.

```bash
pnpm usb-initialize -s 1000
```

### Inspect Drive Contents

After you "insert" the virtual USB drive with `pnpm usb-insert`, you can open
your operating system's file navigator and mount the drive from there.

If you'd rather not rely on the file navigator, you could mount it yourself with
the following:

```bash
pnpm usb-mount
```

It is necessary to first `insert` the drive before mounting because the
filesystem is on a partition of the image and cannot be mounted directly.
