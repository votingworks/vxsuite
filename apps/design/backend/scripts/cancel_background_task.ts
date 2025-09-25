import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { Db } from '../src/db/db';

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const logger = new BaseLogger(LogSource.VxDesignService);
  const db = new Db(logger);
  const result = await db.withClient(async (client) =>
    client.query(
      `
      update background_tasks
      set completed_at = current_timestamp, error = 'Canceled'
      where started_at is not null and completed_at is null
      `
    )
  );
  if (result.rowCount === 0) {
    console.log('No in-progress task found.');
    return;
  }
  console.log(
    'Marked the in-progress task as canceled in the database. Restart the worker.'
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
