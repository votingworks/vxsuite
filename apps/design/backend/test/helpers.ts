import { Server } from 'http';
import { AddressInfo } from 'net';
import * as tmp from 'tmp';
import * as grout from '@votingworks/grout';
import { buildApp } from '../src/app';
import { Store } from '../src/store';
import type { Api } from '../src/app';

tmp.setGracefulCleanup();

export type ApiClient = grout.Client<Api>;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function testSetupHelpers() {
  const servers: Server[] = [];

  function setupApp() {
    const store = Store.fileStore(tmp.fileSync().name);
    const app = buildApp({ store });
    const server = app.listen();
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://localhost:${port}/api`;
    const apiClient = grout.createClient<Api>({ baseUrl });
    return { apiClient };
  }

  function cleanup() {
    for (const server of servers) {
      server.close();
    }
  }

  return {
    setupApp,
    cleanup,
  };
}
