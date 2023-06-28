import { DeferredQueue, deferredQueue, typedAs } from '@votingworks/basics';
import { rootDebug } from '../debug';
import { deserialize } from '../serialization';
import { GroutError, ServerError, isIteratorResult } from '../util';
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
 * Options for creating a Grout stream client.
 */
export interface StreamClientOptions {
  /**
   * The base URL for the API, e.g. "/api" or
   * "http://localhost:1234/api". This must include any path prefix for the API
   * (e.g. /api in this example).
   */
  baseUrl: string;

  /**
   * A factory function for creating EventSource objects.
   */
  eventSourceFactory?: (url: string) => EventSource;
}

/**
 * Constructs the HTTP URL for a Grout method
 */
export function streamMethodUrl(methodName: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${methodName}`;
}

function defaultEventSourceFactory(url: string): EventSource {
  return new EventSource(url);
}

function createSubscriptionForUrl(
  url: string,
  eventSourceFactory: (url: string) => EventSource
): Subscription<unknown> {
  // each subscriber gets its own queue
  const queues: Array<DeferredQueue<IteratorResult<unknown>>> = [];

  // create the event source and set up event handlers
  const eventSource = eventSourceFactory(url);

  eventSource.onmessage = (event) => {
    if (!event.isTrusted) {
      for (const queue of queues) {
        queue.reject(
          new ServerError(
            `received untrusted event from ${url}; this is likely a bug in the server`
          )
        );
      }
      return;
    }

    const data = deserialize(event.data);
    debug(`Event: ${data}`);

    if (!isIteratorResult(data)) {
      for (const queue of queues) {
        queue.reject(
          new ServerError(`received invalid event from ${url}: ${data}`)
        );
      }
      return;
    }

    // resolve all the queues with the event data
    for (const queue of queues) {
      queue.resolve(data);
    }

    // if the event is done, close the event source and clear the queues
    if (data.done) {
      queues.length = 0;
      eventSource.close();
    }
  };

  eventSource.onerror = (event) => {
    for (const queue of queues) {
      queue.reject(new ServerError(`${event}`));
    }
  };

  return typedAs<Subscription<unknown>>({
    [Symbol.asyncIterator]() {
      // we got a new subscriber, so create a new queue for it
      const queue = deferredQueue<IteratorResult<unknown>>();
      queues.push(queue);
      return { next: () => queue.get() };
    },
    unsubscribe: () => eventSource.close(),
  });
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
export function createStreamClient<Api extends AnyStreamApi>({
  baseUrl,
  eventSourceFactory = defaultEventSourceFactory,
}: StreamClientOptions): StreamClient<Api> {
  const subscriptionsByMethod = new Map<string, Subscription<unknown>>();

  // We use a Proxy to create a client object that fakes the type of the API but
  // dynamically converts method calls into HTTP requests. When accessing
  // client.doSomething(), the variable methodName will be "doSomething" -
  // that's the magic of the Proxy!
  return new Proxy({} as unknown as StreamClient<Api>, {
    get(_target, methodName: string) {
      return (input?: unknown) => {
        if (typeof input !== 'undefined') {
          throw new GroutError('stream methods do not accept arguments');
        }

        debug(`Call: ${methodName}()`);

        try {
          const url = streamMethodUrl(methodName, baseUrl);
          const existingSubscription = subscriptionsByMethod.get(url);

          if (existingSubscription) {
            return existingSubscription;
          }

          const subscription = createSubscriptionForUrl(
            url,
            eventSourceFactory
          );

          subscriptionsByMethod.set(url, subscription);
          return subscription;
        } catch (error) {
          throw new ServerError(
            `failed to connect to ${methodName}() at ${baseUrl}: ${error}`
          );
        }
      };
    },
  });
}
