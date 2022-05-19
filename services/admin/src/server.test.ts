import { Logger, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import request from 'supertest';
import { Server } from 'http';
import { buildApp, start } from './server';

let app: Application;

beforeEach(() => {
  app = buildApp();
});

test('starts with default logger and port', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });

  // start up the server
  await start({ app });

  expect(app.listen).toHaveBeenCalled();
});

/*
 ** TODO: this is here for coverage purposes, update to test that correct store
 ** config is loaded once we implement the DB.
 */
test('start with config options', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  const fakeLogger = new Logger(LogSource.VxScanService);
  jest.spyOn(fakeLogger, 'log').mockResolvedValue();

  // start up the server
  await start({ app, logger: fakeLogger });

  expect(fakeLogger.log).toHaveBeenCalled();
});

test('GET /', async () => {
  await request(app).get('/').expect(200);
});
