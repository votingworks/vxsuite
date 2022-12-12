/* eslint-disable no-unused-expressions */
/* eslint-disable @typescript-eslint/require-await */
import { AddressInfo } from 'net';
import express from 'express';
import fetch from 'node-fetch';
import { err, ok, Result } from '@votingworks/types';
import { expectTypeOf } from 'expect-type';
import { createClient } from './client';
import { AnyApi, buildRouter, createApi } from './server';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.fetch = fetch;

function createTestApp(api: AnyApi) {
  const app = express();

  app.use('/api', buildRouter(api, express));

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  return baseUrl;
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
    async getPersonByName(input: {
      name: string;
    }): Promise<Person | undefined> {
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

  const baseUrl = createTestApp(api);
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
  expect(await client.getPersonByName({ name: 'Alice' })).toEqual(undefined);
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
});

test('sends a 500 for unexpected errors', async () => {
  const api = createApi({
    async getStuff(): Promise<number> {
      throw new Error('Unexpected error');
    },
  });

  const baseUrl = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });

  await expect(client.getStuff()).rejects.toThrow('Unexpected error');
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

  const baseUrl = createTestApp(api);
  const client = createClient<typeof api>({ baseUrl });

  await expect(client.getStuff({ shouldFail: false })).resolves.toEqual(ok(42));
  await expect(client.getStuff({ shouldFail: true })).resolves.toEqual(
    err(new Error('Known error'))
  );
});
