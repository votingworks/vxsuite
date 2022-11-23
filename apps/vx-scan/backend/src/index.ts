import * as server from './server';

if (require.main === module) {
  server.start();
}

export type { Config, VxScanApi } from './server';
