// 05-jsonStream.ts
//
// Task: Complete the `extractNamesFromContacts` function using `iter` to return
// JSON with an array of names from a large list of contacts.
//
// Hint: A naive implementation using `iter` would still collect all of the
// names in memory in order to JSON stringify them. Can you do better?

import { iter } from '@votingworks/basics';
import { TODO } from '../src/todo';
import { run } from '../src/example';

async function extractNamesFromContacts(): Promise<string> {
  TODO();
}

async function extractNamesFromContactsReference(): Promise<string> {
  const names: string[] = [];

  for await (const { name } of getListOfContactsFromDatabase()) {
    names.push(name);
  }

  return JSON.stringify(names);
}

interface Contact {
  name: string;
  email: string;
}

function* getListOfContactsFromDatabase(): Generator<Contact> {
  for (let i = 0; i < 100_000; i += 1) {
    yield {
      name: `Person ${i}`,
      email: `person${i}@example.com`,
    };
  }
}

run({
  makeInput: () => undefined,
  referenceImplementation: extractNamesFromContactsReference,
  exerciseImplementation: extractNamesFromContacts,
  solutionImplementation: extractNamesFromContactsSolution,
});

//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//

import { jsonStream } from '@votingworks/utils';

// This is the real solution, but we wrap it in the function below to make it
// have the same signature as the other functions in this exercise.
function extractNamesFromContactsSolutionInner(): AsyncGenerator<string> {
  return jsonStream(
    iter(getListOfContactsFromDatabase()).map(({ name }) => name)
  );
}

// This wrapper just converts the AsyncGenerator<string> to a Promise<string>, but
// in a real application you would want to use the AsyncGenerator directly. Otherwise
// you would be building up a huge string in memory.
async function extractNamesFromContactsSolution(): Promise<string> {
  return (await iter(extractNamesFromContactsSolutionInner()).toArray()).join(
    ''
  );
}
