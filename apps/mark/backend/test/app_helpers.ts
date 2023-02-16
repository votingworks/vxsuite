import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { AddressInfo } from 'net';
import { Api, buildApp } from '../src/app';

export function createApp(): {
  apiClient: grout.Client<Api>;
  app: Application;
  mockAuth: InsertedSmartCardAuthApi;
} {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const app = buildApp(mockAuth);

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  return {
    apiClient,
    app,
    mockAuth,
  };
}
