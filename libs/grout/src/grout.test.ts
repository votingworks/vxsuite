/* eslint-disable no-console */
/* eslint-disable no-unused-expressions */
/* eslint-disable @typescript-eslint/require-await */
import { expect, test, vi } from 'vitest';
import { AddressInfo } from 'node:net';
import express from 'express';
import { assert, err, ok, Result, sleep } from '@votingworks/basics';
import { expectTypeOf } from 'expect-type';
import waitForExpect from 'wait-for-expect';
import { createClient, ServerError } from './client';
import {
  AnyApi,
  buildRouter,
  createApi,
  MiddlewareMethodCall,
  UserError,
} from './server';

function createTestApp(api: AnyApi) {
  const app = express();

  app.use('/api', buildRouter(api, express));

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  return { server, baseUrl, app };
}

test('registers Express routes for an API', async () => {
  interface Person {
    name: string;
    age: number;
  }

  const store: { people: Person[] } = {
    people: [],
  };

  const api = createApi({
    async getAllPeople(): Promise<Person[]> {
      return store.people;
    },
    getPerson(input?: { name: string }): Person | undefined {
      return store.people.find((person) =>
        input ? person.name === input.name : true
      );
    },
    async createPerson(input: { person: Person }) {
      store.people.push(input.person);
    },
    async updatePerson(input: { name: string; newPerson: Person }) {
      store.people = store.people.map((person) =>
        person.name === input.name ? input.newPerson : person
      );
    },
  });

  const { server, baseUrl } = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });

  expectTypeOf(client).toEqualTypeOf<{
    getAllPeople(): Promise<Person[]>;
    getPerson(input?: { name: string }): Promise<Person | undefined>;
    createPerson(input: { person: Person }): Promise<void>;
    updatePerson(input: { name: string; newPerson: Person }): Promise<void>;
  }>();

  // @ts-expect-error Catches typos in method names
  client.getAllPeeple;
  // @ts-expect-error Catches incorrect argument names
  () => client.getPersonByName({ nam: 'Alice' });
  // @ts-expect-error Catches incorrect argument types
  () => client.getPersonByName({ name: 1 });

  const mockPerson: Person = { name: 'Alice', age: 99 };

  expect(await client.getAllPeople()).toEqual([]);
  expect(await client.getPerson({ name: 'Alice' })).toEqual(undefined);
  await client.createPerson({ person: { ...mockPerson } });
  expect(await client.getAllPeople()).toEqual([mockPerson]);
  await client.updatePerson({
    name: 'Alice',
    newPerson: { ...mockPerson, age: 100 },
  });
  expect(await client.getPerson({ name: 'Alice' })).toEqual({
    ...mockPerson,
    age: 100,
  });
  server.close();
});

test('client throws ServerError for unexpected RPC method errors', async () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockReturnValue();
  const api = createApi({
    async getStuff(): Promise<number> {
      throw new Error('Unexpected error');
    },
    async doStuff(): Promise<void> {
      // eslint-disable-next-line no-throw-literal
      throw 'Not even an Error';
    },
  });

  const { server, baseUrl } = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });

  await expect(client.getStuff()).rejects.toThrow('Unexpected error');
  await expect(client.getStuff()).rejects.toThrow(ServerError);
  await expect(client.doStuff()).rejects.toThrow('Not even an Error');
  await expect(client.doStuff()).rejects.toThrow(ServerError);

  expect(consoleErrorSpy).toHaveBeenCalledTimes(4);
  expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('Unexpected error'));
  expect(consoleErrorSpy).toHaveBeenCalledWith('Not even an Error');

  server.close();
});

test('client throws UserError for expected errors', async () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockReturnValue();
  const api = createApi({
    async getStuff(): Promise<number> {
      throw new UserError('Expected error');
    },
  });

  const { server, baseUrl, app } = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const errorMiddlware = vi.fn((_err, _req, _res, _next) => {});
  app.use(errorMiddlware);

  await expect(client.getStuff()).rejects.toThrowError('Expected error');
  await expect(client.getStuff()).rejects.toThrowError(UserError);

  expect(consoleErrorSpy).not.toHaveBeenCalled();
  expect(errorMiddlware).not.toHaveBeenCalled();

  server.close();
});

test('works with the Result type', async () => {
  const api = createApi({
    async getStuff(input: {
      shouldFail: boolean;
    }): Promise<Result<number, Error>> {
      if (input.shouldFail) {
        return err(new Error('Known error'));
      }
      return ok(42);
    },
  });

  const { server, baseUrl } = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });

  await expect(client.getStuff({ shouldFail: false })).resolves.toEqual(ok(42));
  await expect(client.getStuff({ shouldFail: true })).resolves.toEqual(
    err(new Error('Known error'))
  );
  server.close();
});

test('errors if RPC method doesnt have the correct signature', async () => {
  // We can catch the wrong number of arguments for defining a method at compile time
  // (Though there may be 1 or 2 arguments due to optional context)
  createApi({
    // @ts-expect-error `add` method does not match AnyRpcMethod signature
    async add(input1: number, input2: number, input3: number): Promise<number> {
      return input1 + input2 + input3;
    },
  });

  // We can catch the wrong output (not a Promise) at compile time
  createApi({
    // @ts-expect-error `add` method does not match AnyRpcMethod signature
    async add(input: { num1: number; num2: number }): number {
      return input.num1 + input.num2;
    },
  });

  // We can't catch the wrong input type (not an object) at compile time, so we
  // have to do it at runtime
  const api = createApi({
    async sqrt(input: number): Promise<number> {
      return Math.sqrt(input);
    },
  });
  const { baseUrl, server } = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });
  vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
  vi.spyOn(console, 'error').mockReturnValue();
  void client.sqrt(4);
  await waitForExpect(() => {
    expect(process.exit).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      new Error(
        'Grout error: Grout methods must be called with an object or undefined as the sole argument. The argument received was: 4'
      )
    );
  });

  async () => {
    // We can catch the wrong number of arguments when calling a method at compile time
    // @ts-expect-error expected 1 argument, got 2
    await client.sqrt(4, 5);
  };

  server.close();
});

test('errors if app has upstream body-parsing middleware', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      return 42;
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api', buildRouter(api, express));

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const client = createClient<typeof api>({ baseUrl });

  vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
  vi.spyOn(console, 'error').mockReturnValue();
  void client.getStuff();
  await waitForExpect(() => {
    expect(process.exit).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      new Error(
        'Grout error: Request body was parsed as something other than a string. Make sure you haven\'t added any other body parsers upstream of the Grout router - e.g. app.use(express.json()). Body: {"__grout_type":"undefined","__grout_value":"undefined"}'
      )
    );
  });

  server.close();
});

test('client accepts baseUrl with a trailing slash', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      return 42;
    },
  });
  const { server, baseUrl } = createTestApp(api);
  const client = createClient<typeof api>({
    baseUrl: `${baseUrl}/`,
  });
  expect(await client.getStuff()).toEqual(42);
  server.close();
});

test('client errors on incorrect baseUrl', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      return 42;
    },
  });
  const { server, baseUrl } = createTestApp(api);
  const client = createClient<typeof api>({
    baseUrl: `${baseUrl}wrong`,
  });
  await expect(client.getStuff()).rejects.toThrow(
    `Got 404 for ${baseUrl}wrong/getStuff. Are you sure the baseUrl is correct?`
  );
  server.close();
});

test('can send timeout', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      await sleep(100);
      return 42;
    },
  });
  const { server, baseUrl } = createTestApp(api);
  const client = createClient<typeof api>({
    baseUrl,
    timeout: 50,
  });
  await expect(client.getStuff()).rejects.toThrow(
    'The user aborted a request.'
  );

  const noTimeout = createClient<typeof api>({
    baseUrl,
  });
  await expect(noTimeout.getStuff()).resolves.toEqual(42);

  server.close();
});

test('client errors if response is not JSON', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      return 42;
    },
    async getMoreStuff(): Promise<number> {
      return 42;
    },
  });
  const app = express();
  app.post('/api/getStuff', (req, res) => {
    // Send valid JSON, but not the right Content-type
    res.set('Content-Type', 'text/plain');
    res.send('42');
  });
  app.post('/api/getMoreStuff', (req, res) => {
    // No Content-type header
    res.end('42');
  });

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const client = createClient<typeof api>({ baseUrl });

  await expect(client.getStuff()).rejects.toThrow(
    `Response content type is not JSON for ${baseUrl}/getStuff`
  );
  await expect(client.getMoreStuff()).rejects.toThrow(
    `Response content type is not JSON for ${baseUrl}/getMoreStuff`
  );
  server.close();
});

test('client handles non-JSON error responses', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      return 42;
    },
  });
  const app = express();
  app.post('/api/getStuff', (req, res) => {
    res.set('Content-Type', 'application/json');
    // Send invalid JSON (empty response body)
    res.status(500).send();
  });
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const client = createClient<typeof api>({ baseUrl });
  await expect(client.getStuff()).rejects.toThrow('invalid json response body');
  server.close();
});

test('client handles other server errors', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      return 42;
    },
  });
  const app = express();
  app.post('/api/getStuff', (req, res) => {
    res.status(500).send();
  });
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const client = createClient<typeof api>({ baseUrl });
  await expect(client.getStuff()).rejects.toThrow(
    `Got 500 for ${baseUrl}/getStuff`
  );
  server.close();
});

test('middleware runs before and after RPC method, adding context that can be accessed in the method', async () => {
  interface User {
    id: string;
    name: string;
  }
  const mockUser: User = { id: '123', name: 'Alice' };

  interface Context {
    user: User;
    isAuthorized: boolean;
  }

  const loadUserMiddleware = vi.fn(
    (methodCall: MiddlewareMethodCall<Context>) => {
      expect(methodCall.methodName).toEqual('getUserAttribute');
      expect(methodCall.input).toEqual({ attribute: 'name' });
      expect(methodCall.context).toEqual({});
      return { user: mockUser };
    }
  );

  const passthroughMiddleware = vi.fn(() => {
    // Doesn't return updated context
  });

  const authMiddleware = vi.fn((methodCall: MiddlewareMethodCall<Context>) => {
    expect(methodCall.methodName).toEqual('getUserAttribute');
    expect(methodCall.input).toEqual({ attribute: 'name' });
    expect(methodCall.context).toEqual({ user: mockUser });
    return { user: mockUser, isAuthorized: true };
  });

  const loggingMiddleware = vi.fn(
    (
      methodCall: MiddlewareMethodCall<Context>,
      result: Result<unknown, unknown>
    ) => {
      expect(methodCall.methodName).toEqual('getUserAttribute');
      expect(methodCall.input).toEqual({ attribute: 'name' });
      expect(methodCall.context).toEqual({
        user: mockUser,
        isAuthorized: true,
      });
      expect(result).toEqual(ok('Alice'));
    }
  );

  const api = createApi(
    {
      async getUserAttribute(
        input: { attribute: keyof User },
        context: Context
      ) {
        assert(context.user);
        return context.user[input.attribute];
      },
    },
    {
      before: [loadUserMiddleware, passthroughMiddleware, authMiddleware],
      after: [loggingMiddleware],
    }
  );

  const { server, baseUrl } = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });
  expect(await client.getUserAttribute({ attribute: 'name' })).toEqual(
    mockUser.name
  );
  await waitForExpect(() => {
    expect(loadUserMiddleware).toHaveBeenCalledTimes(1);
    expect(authMiddleware).toHaveBeenCalledTimes(1);
    expect(loggingMiddleware).toHaveBeenCalledTimes(1);
  });

  server.close();
});

test('before middleware errors are caught, returned to client, and passed to after middleware', async () => {
  interface Context {}

  const authMiddleware = vi.fn(() => {
    throw new UserError('middleware error');
  });

  const loggingMiddleware = vi.fn(
    (
      methodCall: MiddlewareMethodCall<Context>,
      result: Result<unknown, unknown>
    ) => {
      expect(methodCall.methodName).toEqual('getStuff');
      expect(methodCall.input).toEqual(undefined);
      expect(methodCall.context).toEqual({});
      expect(result).toEqual(err(new UserError('middleware error')));
    }
  );

  const api = createApi(
    {
      async getStuff(): Promise<number> {
        return 42;
      },
    },
    {
      before: [authMiddleware],
      after: [loggingMiddleware],
    }
  );

  const { server, baseUrl } = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });
  await expect(client.getStuff()).rejects.toThrow('middleware error');
  await waitForExpect(() => {
    expect(authMiddleware).toHaveBeenCalledTimes(1);
    expect(loggingMiddleware).toHaveBeenCalledTimes(1);
  });

  server.close();
});

test('can access methods directly for testing', async () => {
  const methods = {
    async getStuff(): Promise<number> {
      return 42;
    },
  } as const;
  const api = createApi(methods);
  expect(api.methods()).toEqual(methods);
});
