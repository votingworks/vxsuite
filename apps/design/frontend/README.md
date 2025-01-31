# VxDesign

An application for designing ballots.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run the app like so:

```sh
# In apps/design/frontend
pnpm start
```

The server will be available at http://localhost:3000.

### Google Cloud Authentication

Follow the instructions
[here](../../../libs/backend/src/language_and_audio/README.md#google-cloud-authentication)
to authenticate with Google Cloud for language and audio file generation.

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

[restore_db_backup.sh](../backend/scripts/restore_db_backup.sh) can be used to
restore a database snapshot to your dev environment. Running this script will
delete your existing local `design` database.

To run this script you may need to configure your environment to use the same
version of `pg_restore` as production.

Ensure you have installed Postgres 16 and have `pg_restore`:

```bash
$ /usr/lib/postgresql/16/bin/pg_restore --version
pg_restore (PostgreSQL) 16.6 (Debian 16.6-1.pgdg120+1)
```

Add `pg_restore` v16 to your PATH in your `.bashrc` or `.bash_profile`:

```
export PATH=/usr/lib/postgresql/16/bin:$PATH
```

Confirm you're running `pg_restore` v16 by default:

```bash
$ source ~/.bashrc
$ pg_restore --version
pg_restore (PostgreSQL) 16.6 (Debian 16.6-1.pgdg120+1)
```
