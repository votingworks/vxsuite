import { createApi, mutation, query } from './api';
import { createClient } from './client';
import fetchMock from 'fetch-mock';

test('create an api and a client', async () => {
  interface Person {
    name: string;
    age: number;
  }

  const api = createApi({
    getPeople: query(async (): Promise<Person[]> => {
      return []; // Mocked, won't be called
    }),
    updatePeople: mutation(async (people: Person[]): Promise<void> => {
      // Mocked, won't be called
    }),
  });

  type ApiType = typeof api;

  const client = createClient<ApiType>();

  fetchMock.getOnce('/api/getPeople', { body: [] });
  const people = await client.getPeople();
  expect(people).toEqual([]);

  const fakePeople = [{ name: 'Alice', age: 42 }];
  fetchMock.postOnce('/api/updatePeople', {
    body: fakePeople,
  });
  await client.updatePeople(fakePeople);

  fetchMock.getOnce('/api/getPeople', { body: fakePeople });
  const updatedPeople = await client.getPeople();
  expect(updatedPeople).toEqual([{ name: 'Alice', age: 42 }]);

  expect(fetchMock.done()).toBe(true);
});
