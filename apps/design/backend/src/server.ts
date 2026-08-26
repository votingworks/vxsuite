import { buildApp } from './app.js';
import { AppContext } from './context.js';
import { PORT } from './globals.js';
import { QaConfig } from './qa_config.js';

/**
 * Starts the server.
 */
/* istanbul ignore next */
export function start(context: AppContext): void {
  const app = buildApp(context);

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`VxDesign backend running at http://localhost:${PORT}/`);
    // eslint-disable-next-line no-console
    console.log(QaConfig.fromEnv()?.summary() ?? 'Automated QA: disabled');
  });
}
