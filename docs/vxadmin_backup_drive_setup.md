# Preparing a VxAdmin Backup Drive

VxAdmin saves backups to an external drive formatted as **ext4**. This guide
covers formatting a new drive on a VxDev laptop and validating it against a
VxAdmin.

## Requirements VxAdmin places on the drive

- **Exactly one partition.** VxAdmin ignores drives with zero or multiple
  partitions.
- **That partition is ext4.** VxAdmin treats ext4 drives as backup drives and
  exFAT/FAT32 drives as regular data USB drives.
- **The top-level directory is writable by VxAdmin.** ext4 records file
  ownership by numeric user and group IDs, which differ between computers, so a
  freshly formatted drive is writable only by the computer's administrator
  (root). Making the top-level directory writable by everyone (below) lets any
  VxAdmin use the drive, including one that has been reimaged.

## What you need

- A VxDev laptop
- The drive(s) to prepare, with power supply and USB cable
- An imaged VxAdmin (download from the Software Image Archive)
- A system administrator card, an election manager card, and an election package
  for that VxAdmin

## 1. Format the drive on the VxDev laptop

> **Warning:** Formatting erases everything on the selected drive. Double-check
> the drive's model and size before formatting.

Open a terminal. Type the commands below, replacing `sdX` with the drive's
device name from `lsblk -o NAME,SIZE,MODEL,FSTYPE` (e.g. `sdb`):

```sh
sudo umount /dev/sdX?* 2>/dev/null
sudo parted --script /dev/sdX mklabel gpt mkpart primary ext4 0% 100%
sudo mkfs.ext4 -L VxBackup /dev/sdX1
```

## 2. Make the drive writable by VxAdmin

In a terminal on the VxDev laptop, with `sdX` the drive's device name:

```sh
lsblk -o NAME,SIZE,MODEL,FSTYPE,LABEL /dev/sdX
```

Confirm the output shows a single partition, `sdX1`, with `FSTYPE` `ext4` and
`LABEL` `VxBackup`. Then:

```sh
sudo mkdir -p /mnt/vxbackup
sudo mount /dev/sdX1 /mnt/vxbackup
sudo chmod 0777 /mnt/vxbackup
ls -ld /mnt/vxbackup   # should start with drwxrwxrwx
sudo umount /mnt/vxbackup
```

Unplug the drive.

## 3. Validate the drive on VxAdmin

- **a.** Configure the VxAdmin with an election package using the system
  administrator card, if it isn't already configured.
- **b.** Log in with the election manager (or system administrator) card and go
  to the **Election** screen.
- **c.** Connect the backup drive and click **Save Backup**. The modal should
  show **Last Backup on Drive: None**. If it instead says **Connect Backup
  Drive**, VxAdmin did not recognize the drive; recheck sections 1 and 2.
- **d.** Click **Save Backup** in the modal and wait for **Backup Saved**. A
  **Backup Failed** message usually means VxAdmin could not write to the drive;
  recheck section 2.
- **e.** Click **Close**, then click **Save Backup** again. The modal should now
  show the backup you just saved under **Last Backup on Drive**. Click
  **Cancel**.
- **f.** Disconnect the drive.

## 4. Clear the backup

Back on the VxDev laptop, connect the drive, then:

```sh
sudo mkdir -p /mnt/vxbackup
sudo mount /dev/sdX1 /mnt/vxbackup
ls -la /mnt/vxbackup   # should list vxadmin-backups and lost+found
sudo rm -rf /mnt/vxbackup/vxadmin-backups
ls -la /mnt/vxbackup   # should list only lost+found
ls -ld /mnt/vxbackup   # should still start with drwxrwxrwx
sudo umount /mnt/vxbackup
```

Leave `lost+found` in place; it is part of every ext4 filesystem. The drive is
now ready to use.
