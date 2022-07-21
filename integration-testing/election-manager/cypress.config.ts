import { defineConfig } from 'cypress';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Define the configuration for the Cypress tests.
 */
export default defineConfig({
  viewportHeight: 1080,
  viewportWidth: 1920,
  e2e: {
    setupNodeEvents(on) {
      on('task', {
        async readMostRecentFile(directoryPath: string) {
          const files = await fs.readdir(directoryPath);
          const paths = files.map((file) => join(directoryPath, file));
          const ctimes = await Promise.all(
            paths.map(async (p) => (await fs.stat(p)).ctime.getTime())
          );
          const mostRecentCtime = Math.max(...ctimes);
          const mostRecentPath = paths[ctimes.indexOf(mostRecentCtime)];
          return await fs.readFile(mostRecentPath, 'utf-8');
        },
      });
    },
    baseUrl: 'http://localhost:3000',
  },
});
