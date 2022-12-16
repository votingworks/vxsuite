/* eslint-disable vx/gts-identifiers */
/* eslint-disable vx/gts-type-parameters */
import { deserialize, serialize } from './serialization';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { AnyApi, inferApiMethods } from './server';
import { rootDebug } from './debug';

const debug = rootDebug.extend('client');

/**
 * A Grout RPC client based on the type of an API definition.
 */
export type Client<TApi extends AnyApi> = inferApiMethods<TApi>;

/**
 * Options for creating a Grout RPC client.
 *  - baseUrl: The base URL for the API, e.g. "/api" or
 *  "http://localhost:1234/api". This must include any path prefix for the API
 *  (e.g. /api in this example).
 */
export interface ClientOptions {
  baseUrl: string;
}

function methodUrl(methodName: string, baseUrl: string) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${methodName}`;
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
  // We use a Proxy to create a client object that fakes the type of the API but
  // dynamically converts method calls into HTTP requests. When accessing
  // client.doSomething(), the variable methodName will be "doSomething" -
  // that's the magic of the Proxy!
  return new Proxy({} as unknown as Client<TApi>, {
    get(_target, methodName: string) {
      return async (input?: unknown) => {
        const inputJson = serialize(input);

        debug(`Call: ${methodName}(${inputJson})`);

        try {
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
            const { message } = await response.json();
            throw new ServerError(message);
          }

          const resultText = await response.text();
          debug(`Result: ${resultText}`);
          const result = deserialize(resultText);
          return result;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : /* istanbul ignore next - no easy way to test throwing a non-Error */
                String(error);
          debug(`Error: ${message}`);
          throw new ServerError(message, {
            cause:
              error instanceof Error
                ? error
                : /* istanbul ignore next - no easy way to test throwing a non-Error */
                  undefined,
          });
        }
      };
    },
  });
}
