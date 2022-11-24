import fetchMock from 'fetch-mock';
import { createApi, mutation, query } from './api';
import { createClient } from './client';

test('create an api and a client', async () => {
  interface Person {
    name: string;
    age: number;
  }

  const api = createApi({
    // eslint-disable-next-line @typescript-eslint/require-await
    getPeople: query(async (): Promise<Person[]> => {
      return []; // Mocked, won't be called
    }),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    updatePeople: mutation(async (people: Person[]): Promise<void> => {
      // Mocked, won't be called
    }),
  });

  type ApiType = typeof api;

  const client = createClient<ApiType>();

  fetchMock.getOnce('/api/getPeople', []);
  const people = await client.queries.getPeople();
  expect(people).toEqual([]);

  const fakePeople = [{ name: 'Alice', age: 42 }];
  fetchMock.postOnce('/api/updatePeople', {
    body: fakePeople,
  });
  await client.mutations.updatePeople(fakePeople);

  fetchMock.getOnce('/api/getPeople', fakePeople, { overwriteRoutes: true });
  const updatedPeople = await client.queries.getPeople();
  expect(updatedPeople).toEqual([{ name: 'Alice', age: 42 }]);

  expect(fetchMock.done()).toBe(true);
});
