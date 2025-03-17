# VxDesign

An application for designing ballots.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then follow the instructions below.

### Google Cloud Authentication

Follow the instructions
[here](../../../libs/backend/src/language_and_audio/README.md#google-cloud-authentication)
to authenticate with Google Cloud for language and audio file generation.

### Database

#### PostgreSQL Version

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

#### Initializing the database

Before running the app or any server tests for the first time, you'll need to
set up the DB schema by running the following command from
`apps/design/backend`:

```sh
pnpm db:reset-dev
```

This will create a Postgres database called `design`, with a username `design`
and password `design`. The above command can also be run to reset the DB and
start from a clean slate, if necessary. If simply modifying the schema, or
updating your local DB after a schema change, see `Updating the database schema`
below

#### Updating the database schema

The database schema is managed with
[node-pg-migrate](https://salsita.github.io/node-pg-migrate/getting-started),
which reads migration scripts from the `apps/design/backend/migrations`
directory.

To create a new migration, run the following command from `apps/design/backend`:

```sh
pnpm db:migrations:create descriptive-name-for-migration
```

The above will create a file in `apps/design/backend/migrations` with the
provided name and timestamp prefix. e.g.
`1742239962751_descriptive-name-for-migration.js`. Edit the file to define all
the necessary schema changes. If you need help, take a look at previous
migration scripts, or the
[`node-pg-migrate`](https://salsita.github.io/node-pg-migrate/migrations/)
documentation.

> [!NOTE]
>
> In simple cases, it will be safe let the automated migration run as part of
> the deployment process (see [heroku.yml](../../../heroku.yml)), but be mindful
> of any long-running migrations that may lock up the database for an extended
> period. We may want to run those during off-hours.
> [Squawk's lint rules](https://squawkhq.com/) may be helpful when deciding on
> approaches to updating the schema.

To test a new migration locally, run the following command from
`apps/design/backend`:

```sh
pnpm db:migrations:run-dev
```

This will apply your changes to the `design` DB on `localhost`. If you'd like to
tinker on a scratch DB instead, you can use the `:run` script instead with an
explicit `DATABASE_URL` env var:

```sh
DATABASE_URL=... pnpm db:migrations:run
```

To undo the most recent migration for dev iteration, run the following command
from `apps/design/backend`:

```sh
pnpm db:migrations:undo-last-dev
```

OR

```sh
DATABASE_URL=... pnpm db:migrations:undo-last
```

## Running the app

In `apps/design/frontend`, run the following:

```sh
pnpm start
```

The server will be available at http://localhost:3000.

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

## Support Tools

**User/Org Management**: See backend scripts [README](../../README.md) for more
info.
