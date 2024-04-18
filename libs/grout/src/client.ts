import fetch from 'cross-fetch';
import { deserialize, serialize } from './serialization';
import { AnyApi, AnyRpcMethod, inferApiMethods } from './server';
import { rootDebug } from './debug';

const debug = rootDebug.extend('client');

/**
 * Wraps a method's return type in a Promise if it isn't already a Promise.
 */
export type AsyncRpcMethod<Method extends AnyRpcMethod> = (
  ...args: Parameters<Method>
) => Promise<Awaited<ReturnType<Method>>>;

/**
 * A Grout RPC client based on the type of an API definition.
 */
export type Client<Api extends AnyApi> = {
  [Method in keyof inferApiMethods<Api>]: AsyncRpcMethod<
    inferApiMethods<Api>[Method]
  >;
};

/**
 * Options for creating a Grout RPC client.
 *  - baseUrl: The base URL for the API, e.g. "/api" or
 *  "http://localhost:1234/api". This must include any path prefix for the API
 *  (e.g. /api in this example).
 */
export interface ClientOptions {
  baseUrl: string;
}

/**
 * Constructs the HTTP URL for a Grout method
 */
export function methodUrl(methodName: string, baseUrl: string): string {
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
 * API methods can be called just like any regular async function. For example:
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
export function createClient<Api extends AnyApi>(
  options: ClientOptions
): Client<Api> {
  // We use a Proxy to create a client object that mocks the type of the API but
  // dynamically converts method calls into HTTP requests. When accessing
  // client.doSomething(), the variable methodName will be "doSomething" -
  // that's the magic of the Proxy!
  return new Proxy({} as unknown as Client<Api>, {
    get(_target, methodName: string) {
      return async (input?: unknown) => {
        const inputJson = serialize(input);

        debug(`Call: ${methodName}(${inputJson})`);

        try {
          const url = methodUrl(methodName, options.baseUrl);
          const response = await fetch(url, {
            method: 'POST',
            body: serialize(input),
            headers: { 'Content-type': 'application/json' },
          });
          debug(`Response status code: ${response.status}`);

          const hasJsonBody = response.headers
            .get('Content-type')
            ?.includes('application/json');

          if (!response.ok) {
            if (hasJsonBody) {
              const { message } = await response.json();
              throw new ServerError(message);
            }
            if (response.status === 404) {
              throw new ServerError(
                `Got 404 for ${url}. Are you sure the baseUrl is correct?`
              );
            }
            throw new ServerError(`Got ${response.status} for ${url}`);
          }

          if (!hasJsonBody) {
            throw new ServerError(
              `Response content type is not JSON for ${url}`
            );
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
