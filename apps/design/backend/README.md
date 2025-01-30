# VxDesign Backend

This backend is used by the [VxDesign frontend](../frontend) and isn't intended
to be run on its own. The best way to develop on the backend is by running the
frontend.

## PostgreSQL Version

VxDesign expects PostgreSQL version 16.6. Debian 12
[defaults](https://packages.debian.org/bookworm/postgresql) to PostgreSQL
version 15.

To upgrade, configure `apt` to use the PostgreSQL Apt Repository. From the
official [PostgreSQL docs](https://www.postgresql.org/download/linux/debian/)
run

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
```

then install `postgresql-16`:

```bash
sudo apt install postgresql-16 postgresql-client-16
```

## Restoring database from snapshot

[restore_db_backup.sh](./scripts/restore_db_backup.sh) can be used to restore a
database snapshot to your dev environment. Running this script will delete your
existing local `design` database.

To run this script you may need to configure your environment to use the same
version of `pg_restore` as production. Add `pg_restore` v16 to your PATH in your
`.bashrc` or `.bash_profile`:

```
export PATH=/usr/lib/postgresql/16/bin:$PATH
```
