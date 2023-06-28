import { deferredQueue, typedAs } from '@votingworks/basics';
import { rootDebug } from '../debug';
import { deserialize } from '../serialization';
import { GroutError, ServerError, isObject } from '../util';
import { AnyStreamApi, AnyStreamMethod, inferStreamApiMethods } from './server';

const debug = rootDebug.extend('stream:client');

/**
 * A subscription to a Grout stream method that can be cancelled.
 */
export interface Subscription<T> extends AsyncIterable<T> {
  /**
   * Cancels the subscription.
   */
  unsubscribe(): void;
}

/**
 * Wraps a method's return type in a Promise if it isn't already a Promise.
 */
export type AsyncStreamMethod<Method extends AnyStreamMethod> = (
  ...args: Parameters<Method>
) => ReturnType<Method> extends AsyncIterable<infer R>
  ? Subscription<R>
  : never;

/**
 * A Grout stream client based on the type of an API definition.
 */
export type StreamClient<Api extends AnyStreamApi> = {
  [Method in keyof inferStreamApiMethods<Api>]: AsyncStreamMethod<
    inferStreamApiMethods<Api>[Method]
  >;
};

/**
 * Options for creating a Grout RPC client.
 *  - baseUrl: The base URL for the API, e.g. "/api" or
 *  "http://localhost:1234/api". This must include any path prefix for the API
 *  (e.g. /api in this example).
 */
export interface StreamClientOptions {
  baseUrl: string;
}

/**
 * Constructs the HTTP URL for a Grout method
 */
export function streamMethodUrl(methodName: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${methodName}`;
}

function isIteratorResult(value: unknown): value is IteratorResult<unknown> {
  if (isObject(value)) {
    const iteratorResult = value as { done: boolean; value?: unknown };

    if (typeof iteratorResult.done === 'boolean') {
      return true;
    }
  }

  return false;
}

/**
 * Creates a Grout stream client based on the type of an API definition. You should
 * import the API definition type using `import type` to avoid importing the
 * server code.
 *
 * API methods can be called just like any regular async iterable function. For
 * example:
 *
 * ```ts
 * import type { MyApi } from 'my-api-server-package';
 * const options = { baseUrl: 'http://localhost:1234/api' };
 * const client = createStreamClient<MyApi>(options);
 * for await (const value of client.watchStatus()) {
 *  console.log(value);
 * }
 * ```
 *
 * Each method will return an async iterable whose iterator results reject in
 * case of an unexpected server error.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function createStreamClient<Api extends AnyStreamApi>(
  options: StreamClientOptions
): StreamClient<Api> {
  // We use a Proxy to create a client object that fakes the type of the API but
  // dynamically converts method calls into HTTP requests. When accessing
  // client.doSomething(), the variable methodName will be "doSomething" -
  // that's the magic of the Proxy!
  return new Proxy({} as unknown as StreamClient<Api>, {
    get(_target, methodName: string) {
      return () => {
        if (arguments.length !== 0) {
          throw new GroutError(
            `Stream methods do not accept arguments. Received ${arguments.length} arguments.`
          );
        }

        debug(`Call: ${methodName}()`);

        try {
          const url = streamMethodUrl(methodName, options.baseUrl);
          const eventSource = new EventSource(url);
          const queue = deferredQueue<IteratorResult<unknown>>();

          eventSource.onmessage = (event) => {
            if (!event.isTrusted) {
              queue.reject(
                new ServerError(
                  `Received untrusted event from ${url}. This is likely a bug in the server.`
                )
              );
              return;
            }

            const data = deserialize(event.data);
            debug(`Event: ${data}`);

            if (!isIteratorResult(data)) {
              queue.reject(
                new ServerError(`Received invalid event from ${url}: ${data}`)
              );
              return;
            }

            if (data.done) {
              eventSource.close();
            }

            queue.resolve(data);
          };

          eventSource.onerror = (event) => {
            queue.reject(new ServerError(`${event}`));
          };

          return typedAs<Subscription<unknown>>({
            [Symbol.asyncIterator]: () => ({ next: () => queue.get() }),
            unsubscribe: () => eventSource.close(),
          });
        } catch (error) {
          throw new ServerError(
            `Failed to connect to ${methodName}() at ${options.baseUrl}: ${error}`
          );
        }
      };
    },
  });
}
