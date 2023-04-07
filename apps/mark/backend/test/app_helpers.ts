import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { AddressInfo } from 'net';
import { fakeLogger } from '@votingworks/logging';
import tmp from 'tmp';
import { MockUsb, createMockUsb } from '@votingworks/backend';
import { Server } from 'http';
import { Api, buildApp } from '../src/app';
import { createWorkspace } from '../src/util/workspace';

interface MockAppContents {
  apiClient: grout.Client<Api>;
  app: Application;
  mockAuth: InsertedSmartCardAuthApi;
  mockUsb: MockUsb;
  server: Server;
}

export function createApp(): MockAppContents {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace = createWorkspace(tmp.dirSync().name);
  const mockUsb = createMockUsb();

  const app = buildApp(mockAuth, logger, workspace, mockUsb.mock);

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  return {
    apiClient,
    app,
    mockAuth,
    mockUsb,
    server,
  };
}
