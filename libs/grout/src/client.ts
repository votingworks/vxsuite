/* eslint-disable vx/gts-identifiers */
/* eslint-disable vx/gts-type-parameters */
import { deserialize, serialize } from './serialization';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { AnyApi, Api } from './server';
import { rootDebug } from './debug';

const debug = rootDebug.extend('client');

type inferApiMethods<TApi extends AnyApi> = TApi extends Api<infer TMethods>
  ? TMethods
  : never;

/**
 * A Grout RPC client based on the type of an API definition.
 */
export type Client<TApi extends AnyApi> = inferApiMethods<TApi>;

/**
 * Options for creating a Grout RPC client.
 *  - baseUrl: The base URL for the API, e.g. "http://localhost:1234/api". This
 *    must include any path prefix for the API (e.g. /api in this example).
 */
export interface ClientOptions {
  baseUrl: string;
}

function methodUrl(methodName: string, baseUrl: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(methodName, base);
  return url.toString();
}

/**
 * An unexpected error from the server (e.g. a crash or runtime exception).
 */
export class ServerError extends Error {}

/**
 * Creates a Grout RPC client based on the type of an API definition. You should
 * import the API definition type using `import type` to avoid importing the
 * server code.
 *
 * API methods can be called just like any regular function. For example:
 *
 *  import type { MyApi } from 'my-api-server-package';
 *  const options = { baseUrl: 'http://localhost:1234/api' };
 *  const client = createClient<MyApi>(options);
 *  await client.sayHello({ name: 'World' }); // => 'Hello, World!'
 *
 * Each method will return a Promise that rejects in case of an unexpected
 * server error.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function createClient<TApi extends AnyApi>(
  options: ClientOptions
): Client<TApi> {
  return new Proxy({} as unknown as Client<TApi>, {
    get(_target, methodName: string) {
      return async (input?: unknown) => {
        const inputJson = serialize(input);

        debug(`Call: ${methodName}(${inputJson})`);

        const response = await fetch(methodUrl(methodName, options.baseUrl), {
          method: 'POST',
          body: serialize(input),
          headers: { 'Content-type': 'application/json' },
        });

        debug(`Response status code: ${response.status}`);

        if (
          !response.headers.get('Content-type')?.includes('application/json')
        ) {
          throw new ServerError('Response is not JSON');
        }

        if (!response.ok) {
          const message = (await response.json())?.message;
          debug(`Error: ${message}`);
          throw new ServerError(message ?? response.statusText);
        }

        const resultText = await response.text();
        debug(`Result: ${resultText}`);
        const result = deserialize(resultText);
        return result;
      };
    },
  });
}
