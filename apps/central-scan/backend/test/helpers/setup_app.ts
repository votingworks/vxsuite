import { MockUsb, createMockUsb } from '@votingworks/backend';
import { Application } from 'express';
import { Logger, fakeLogger } from '@votingworks/logging';
import { Server } from 'http';
import * as grout from '@votingworks/grout';
import {
  buildMockArtifactAuthenticator,
  buildMockDippedSmartCardAuth,
} from '@votingworks/auth';
import { dirSync } from 'tmp';
import getPort from 'get-port';
import { deferred } from '@votingworks/basics';
import { Workspace, createWorkspace } from '../../src/util/workspace';
import { MockScanner, makeMockScanner } from '../util/mocks';
import { Importer } from '../../src/importer';
import { Api } from '../../src';
import { buildCentralScannerApp } from '../../src/central_scanner_app';
import { start } from '../../src/server';
import { Store } from '../../src/store';

export async function withApp(
  fn: (context: {
    auth: ReturnType<typeof buildMockDippedSmartCardAuth>;
    artifactAuthenticator: ReturnType<typeof buildMockArtifactAuthenticator>;
    workspace: Workspace;
    scanner: MockScanner;
    mockUsb: MockUsb;
    importer: Importer;
    app: Application;
    logger: Logger;
    apiClient: grout.Client<Api>;
    server: Server;
    store: Store;
  }) => Promise<void>
): Promise<void> {
  const port = await getPort();
  const auth = buildMockDippedSmartCardAuth();
  const artifactAuthenticator = buildMockArtifactAuthenticator();
  const workspace = createWorkspace(dirSync().name);
  const scanner = makeMockScanner();
  const importer = new Importer({ workspace, scanner });
  const mockUsb = createMockUsb();
  const logger = fakeLogger();
  const app = buildCentralScannerApp({
    auth,
    artifactAuthenticator,
    usb: mockUsb.mock,
    allowedExportPatterns: ['/tmp/**'],
    importer,
    workspace,
    logger,
  });
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient({
    baseUrl,
  });
  const server = await start({
    app,
    logger,
    workspace,
    port,
  });

  try {
    await fn({
      auth,
      artifactAuthenticator,
      workspace,
      store: workspace.store,
      scanner,
      mockUsb,
      importer,
      app,
      logger,
      apiClient,
      server,
    });
  } finally {
    const { promise, resolve, reject } = deferred<void>();
    server.close((error) => (error ? reject(error) : resolve()));
    await promise;
    workspace.reset();
  }
}
