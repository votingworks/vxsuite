import { buildApp } from './app';
import { PORT } from './globals';
import { Store } from './store';

/**
 * Starts the server.
 */
export function start({ store }: { store: Store }): void {
  const app = buildApp({ store });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`VxDesign backend running at http://localhost:${PORT}/`);
  });
}
