# USB Drive Mocking

The `bash` scripts in this library are useful for mocking USB drives in
`vxsuite`. The mock consists of a simple loop device backed by an `.img` file.
The contained filesystem persists and its contents can be separately inspected
and manipulated.

The current iteration of these scripts only supports one virtual USB drive image
at a time. You can reset and resize whenever necessary.

### `insert.sh` - Insert Drive

"Inserts" the virtual USB drive. Does not mount the drive.

```bash
sudo bash insert.sh
```

### `remove.sh` - Remove Drive

"Removes" the virtual USB drive.

```bash
sudo bash remove.sh
```

### `initialize.sh` - Initializing (Resizing)

`insert.sh` will automatically initialize a 64MB virtual USB drive if none
exists. You can use `initialize.sh` to create a virtual USB drive of a different
size or simply if you want to wipe the existing filesystem. The script takes the
`-s` flag to indicate the size of the virtual USB drive in megabytes. The image
is not compressed on your device and will take up the equivalent amount of
space.

```bash
sudo bash initialize.sh -s 1000
```
