import { BaseLogger, LogSource } from '@votingworks/logging';
import { Db } from '../build/index.js';
import { runDesignMigrations } from '../build/dev/run_design_migrations.js';

const db = new Db(new BaseLogger(LogSource.System), {
  connectionString: process.argv[2],
});
await db.withClient((client) =>
  runDesignMigrations(client, { schemaName: 'public' })
);
await db.close();
