/* eslint-disable no-unused-expressions */
/* eslint-disable @typescript-eslint/require-await */
import { Result, err, ok } from '@votingworks/basics';
import { expect, spyOn, test } from 'bun:test';
import { expectTypeOf } from 'expect-type';
import { createClient } from './client';
import { AnyApi, buildRouter, createApi } from './server';

function createTestApp(api: AnyApi) {
  const server = Bun.serve({
    port: 0,
    ...buildRouter(api, '/api'),
  });
  const { port } = server;
  const baseUrl = `http://localhost:${port}/api`;
  return { server, baseUrl };
}

test('createApi happy path', async () => {
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
    getPersonByName(input: { name: string }): Person | undefined {
      return store.people.find((person) => person.name === input.name);
    },
    async createPerson(input: { person: Person }) {
      store.people.push(input.person);
    },
    async updatePersonByName(input: { name: string; newPerson: Person }) {
      store.people = store.people.map((person) =>
        person.name === input.name ? input.newPerson : person
      );
    },
  });

  const { server, baseUrl } = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });

  expectTypeOf(client).toEqualTypeOf<{
    getAllPeople(): Promise<Person[]>;
    getPersonByName(input: { name: string }): Promise<Person | undefined>;
    createPerson(input: { person: Person }): Promise<void>;
    updatePersonByName(input: {
      name: string;
      newPerson: Person;
    }): Promise<void>;
  }>();

  // @ts-expect-error Catches typos in method names
  client.getAllPeeple;
  // @ts-expect-error Catches incorrect argument names
  () => client.getPersonByName({ nam: 'Alice' });
  // @ts-expect-error Catches incorrect argument types
  () => client.getPersonByName({ name: 1 });

  const mockPerson: Person = { name: 'Alice', age: 99 };

  expect(await client.getAllPeople()).toEqual([]);
  expect(await client.getPersonByName({ name: 'Alice' })).toBeUndefined();
  await client.createPerson({ person: { ...mockPerson } });
  expect(await client.getAllPeople()).toEqual([mockPerson]);
  await client.updatePersonByName({
    name: 'Alice',
    newPerson: { ...mockPerson, age: 100 },
  });
  expect(await client.getPersonByName({ name: 'Alice' })).toEqual({
    ...mockPerson,
    age: 100,
  });
  server.stop();
});

test('async generator methods', async () => {
  const api = createApi({
    async *getNumbers(): AsyncGenerator<number> {
      yield 1;
      yield 2;
      yield 3;
    },
  });

  const { server, baseUrl } = createTestApp(api);

  const client = createClient<typeof api>({ baseUrl });

  const numbers = client.getNumbers();

  expect(await numbers.next()).toEqual({ value: 1, done: false });
  expect(await numbers.next()).toEqual({ value: 2, done: false });
  expect(await numbers.next()).toEqual({ value: 3, done: false });
  expect(await numbers.next()).toEqual({ value: undefined, done: true });

  server.stop();
});

test('sends a 500 for unexpected errors', async () => {
  const consoleErrorSpy = spyOn(console, 'error').mockReturnValue();
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

  expect(client.getStuff()).rejects.toThrow('Unexpected error');
  expect(client.doStuff()).rejects.toThrow('Not even an Error');

  expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('Unexpected error'));
  expect(consoleErrorSpy).toHaveBeenCalledWith('Not even an Error');

  server.stop();
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

  expect(await client.getStuff({ shouldFail: false })).toEqual(ok(42));
  expect(await client.getStuff({ shouldFail: true })).toEqual(
    err(new Error('Known error'))
  );
  server.stop();
});

test('errors if RPC method doesnt have the correct signature', async () => {
  // We can catch the wrong number of arguments at compile time
  createApi({
    // @ts-expect-error `add` method does not match AnyRpcMethod signature
    async add(input1: number, input2: number): Promise<number> {
      return input1 + input2;
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
  expect(client.sqrt(4)).rejects.toThrow(
    'Grout methods must be called with an object or undefined as the sole argument. The argument received was: 4'
  );
  server.stop();
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
  server.stop();
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
  expect(client.getStuff()).rejects.toThrow(
    `Got 404 for ${baseUrl}wrong/getStuff. Are you sure the baseUrl is correct?`
  );
  server.stop();
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
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      switch (url.pathname) {
        case '/api/getStuff': {
          // Send valid JSON, but not the right Content-type
          return new Response('42', {
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        case '/api/getMoreStuff': {
          // No Content-type header
          return new Response('42');
        }
        default: {
          return new Response('Not Found', { status: 404 });
        }
      }
    },
  });
  const baseUrl = `http://localhost:${server.port}/api`;
  const client = createClient<typeof api>({ baseUrl });

  expect(client.getStuff()).rejects.toThrow(
    `Response content type is not JSON for ${baseUrl}/getStuff`
  );
  expect(client.getMoreStuff()).rejects.toThrow(
    `Response content type is not JSON for ${baseUrl}/getMoreStuff`
  );
  server.stop();
});

test('client handles non-JSON error responses', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      return 42;
    },
  });
  const server = Bun.serve({
    port: 0,
    fetch() {
      return new Response('', {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const baseUrl = `http://localhost:${server.port}/api`;
  const client = createClient<typeof api>({ baseUrl });
  expect(client.getStuff()).rejects.toThrow(/json/i);
  server.stop();
});

test('client handles other server errors', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      return 42;
    },
  });
  const server = Bun.serve({
    port: 0,
    fetch() {
      return new Response('Internal Server Error', { status: 500 });
    },
  });
  const baseUrl = `http://localhost:${server.port}/api`;
  const client = createClient<typeof api>({ baseUrl });
  expect(client.getStuff()).rejects.toThrow(`Got 500 for ${baseUrl}/getStuff`);
  server.stop();
});
