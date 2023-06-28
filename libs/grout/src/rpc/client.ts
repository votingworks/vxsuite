import { deserialize, serialize } from '../serialization';
import { AnyRpcApi, AnyRpcMethod, inferRpcApiMethods } from './server';
import { rootDebug } from '../debug';
import { ServerError } from '../util';

const debug = rootDebug.extend('rpc:client');

/**
 * Wraps a method's return type in a Promise if it isn't already a Promise.
 */
export type AsyncRpcMethod<Method extends AnyRpcMethod> = (
  ...args: Parameters<Method>
) => ReturnType<Method> extends AsyncIterable<unknown>
  ? never
  : Promise<Awaited<ReturnType<Method>>>;

/**
 * A Grout RPC client based on the type of an API definition.
 */
export type RpcClient<Api extends AnyRpcApi> = {
  [Method in keyof inferRpcApiMethods<Api>]: AsyncRpcMethod<
    inferRpcApiMethods<Api>[Method]
  >;
};

/**
 * Options for creating a Grout RPC client.
 *  - baseUrl: The base URL for the API, e.g. "/api" or
 *  "http://localhost:1234/api". This must include any path prefix for the API
 *  (e.g. /api in this example).
 */
export interface RpcClientOptions {
  baseUrl: string;
}

/**
 * Constructs the HTTP URL for a Grout method
 */
export function rpcMethodUrl(methodName: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${methodName}`;
}

/**
 * Creates a Grout RPC client based on the type of an API definition. You should
 * import the API definition type using `import type` to avoid importing the
 * server code.
 *
 * API methods can be called just like any regular async function. For example:
 *
 * ```ts
 * import type { MyApi } from 'my-api-server-package';
 * const options = { baseUrl: 'http://localhost:1234/api' };
 * const client = createClient<MyApi>(options);
 * await client.sayHello({ name: 'World' }); // => 'Hello, World!'
 * ```
 *
 * Each method will return a Promise that rejects in case of an unexpected
 * server error.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function createRpcClient<Api extends AnyRpcApi>(
  options: RpcClientOptions
): RpcClient<Api> {
  // We use a Proxy to create a client object that fakes the type of the API but
  // dynamically converts method calls into HTTP requests. When accessing
  // client.doSomething(), the variable methodName will be "doSomething" -
  // that's the magic of the Proxy!
  return new Proxy({} as unknown as RpcClient<Api>, {
    get(_target, methodName: string) {
      return async (input?: unknown) => {
        const inputJson = serialize(input);

        debug(`Call: ${methodName}(${inputJson})`);

        try {
          const url = rpcMethodUrl(methodName, options.baseUrl);
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
