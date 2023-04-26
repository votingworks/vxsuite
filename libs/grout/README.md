# Grout

A library to create type-safe RPC glue code.

Grout lets you define a server API as a plain TS object with async methods.
Based on this API definition, Grout will create Express route handlers on the
server side and a type-safe client on the client side, abstracting away the
details of the underlying HTTP requests.

## Installation

Grout must be installed as a dependency in both your client and server projects.

## Usage

### Server

```ts
import * as grout from '@votingworks/grout';

interface Person {
  name: string;
  age: number;
}

// Create an API definition by building an object with async methods.
const api = grout.createApi({
  // Each method should return simple TS values - not fancy class instances.
  // Values that can be easily serialized to JSON. More details on this below.
  getAllPeople(): Person[] {
    return store.getAllPeople(); // Assume this accesses the database, etc.
  },

  // Methods can take input, but it must be packaged into a single object.
  // Think of it like using named parameters, or React component props.
  getPersonByName(input: { name: string }): Person | undefined {
    return store.getPersonByName(input.name);
  },

  // Async methods are supported, just wrap the return type with a Promise. For
  // known errors (e.g. invalid input), use a Result type so that the client is
  // forced to handle them explicitly.
  async updatePersonAge(input: {
    name: string;
    age: number;
  }): Promise<Result<void, Error>> {
    if (age < 0) {
      return err(new Error('Age must be at least 0.'));
    }
    await store.updatePersonAge(input.name, input.age);
    return ok();
  },
});

const app = express();

// When registering the API with an Express app, Grout creates an Express Router
// to isolate the Grout API routes from other routes in your app. You can mount
// this router using any path prefix you want - here we use `/api`. It's
// important that you don't use any other body-parsing middleware upstream of
// the router - e.g. don't call `app.use(express.json())` before this.
app.use('/api', buildRouter(api, express));

// Don't forget to export the API type - we'll need it for the client.
export type MyApi = typeof api;
```

### Client

```ts
import * as grout from '@votingworks/grout';

// First, we need to import the API type from the server. This will *not* import
// any of the actual server code - just the type definition.
import type { MyApi } from './server';

// We need to set the base URL for the client. Make sure to include the path
// prefix (in our case, /api).
const baseUrl = '/api';

// Create the client using MyApi as a type parameter.
const apiClient = grout.createClient<MyApi>({ baseUrl });

// Now we can call the API methods we defined as normal functions. Note that all
// the methods are async now, since there's a network request involved.
await apiClient.getAllPeople(); // => [{ name: 'Alice', age: 99 }, ...]
await apiClient.getPersonByName({ name: 'Bob' }); // => { name: 'Bob', age: 42 }
await apiClient.updatePersonAge({ name: 'Bob', age: 43 }); // => ok()

// If we make a mistake, we'll get a type error, just like with normal typed functions
await apiClient.getAllPeeple(); // => TS error: Property getAllPeeple does not exist
await apiClient.getPersonByName({ nam: 'Bob' }); // => TS error: Argument of type '{ nam: string; }' is not assignable to parameter of type '{ name: string; }'.
await apiClient.updatePersonAge({ name: 'Bob', age: '1' }); // => TS error: Argument of type '{ name: 'Bob'; age: '1'; }' is not assignable to parameter of type '{ name: string; age: number; }'.

// Since we used the Result type to handle a known error case, we should
// explicitly check for errors. This is a strongly recommended pattern to help
// us avoid forgetting to handle known errors.
const updateResult = await apiClient.updatePersonAge({ name: 'Bob', age: -1 });
if (updateResult.isErr()) {
  console.error(updateResult.error.message); // => 'Age must be at least 0.'
}

// If there's an unexpected server error (e.g. a crash or runtime exception),
// the Promise returned by the client method will be rejected, so we still need
// to handle exceptions.
try {
  await apiClient.getAllPeople();
} catch (error) {
  if (error instanceof grout.ServerError) {
    console.error(error.message);
  }
}
```

### Testing

To test your server API, you can simply run the server and use the Grout client
to call the API methods.

To mock your API in client-side tests, you can use the `createMockClient` method
from `@votingworks/grout-test-utils`:

```ts
import { createMockClient } from '@votingworks/grout-test-utils';

let mockApiClient: MockClient<Api>;

// Ensure the mock is in a clean state before each test by creating a new one
beforeEach(() => {
  mockApiClient = createMockClient<MyApi>();
});

// Ensure all expected calls were made after each test
afterEach(() => {
  mockApiClient.assertComplete();
});

test('it works', () => {
  // Each method on the mock client is a MockFunction (see @votingworks/test-utils).
  mockApiClient.getAllPeople
    .expectCallWith()
    .resolves([{ name: 'Alice', age: 99 }]);
  expect(await mockApiClient.getAllPeople()).toEqual([
    { name: 'Alice', age: 99 },
  ]);
});
```

### tsconfig settings

Grout works out of the box with our default `tsconfig.json` settings. However,
you can enable VS Code's "Go to Definition" feature by turning on
`compilerOptions.declarationMap` in your server-side `tsconfig.build.json`. This
will allow you to Cmd+Click on a method name in the client code and jump to the
server-side implementation.

```json
{
  "compilerOptions": {
    "declarationMap": true
  }
}
```

## HTTP Transport Details

Grout uses HTTP POST requests for all RPC method calls.

Input is sent using a JSON request body and output is returned as a JSON
response, both of which are serialized using Grout's serialization format. This
allows requests to be human-readable while still supporting richer types than
plain JSON.

Grout supports the following data types:

- `undefined`
- `null`
- `boolean`
- `number`
- `string`
- `Array`
- `Object` (plain objects)
- `Error`
- `Date`
- `Result` (from @votingworks/basics)
- `Buffer`

Data can compose and nest as much as you like using the above types.

## Development

See package.json for a full list of development commands. Here are a few common
ones:

```sh
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build the library
pnpm build
```
