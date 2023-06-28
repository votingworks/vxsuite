import type Express from 'express';
import { rootDebug } from '../debug';
import { serialize } from '../serialization';
import { GroutError, isAsyncGeneratorFunction } from '../util';

const debug = rootDebug.extend('server:stream');

/**
 * A Grout stream method.
 *
 * A stream method must take no arguments. It must return an async iterable.
 *
 * Method output values must be serializable to JSON and deserializable from
 * JSON. Grout supports built-in JSON types as well as some extras (e.g.
 * undefined, Error, Result). See the serialization module for specifics.
 */
export type AnyStreamMethod = (input: unknown) => unknown;

/**
 * Base type for any method dictionary passed to createApi.
 */
export interface AnyStreamMethods {
  [methodName: string]: AnyStreamMethod;
}

/**
 * Type for a specific API definition returned by createStreamApi.
 */
export type StreamApi<Methods extends AnyStreamMethods> = Methods;

/**
 * Base type for any API definition.
 */
export type AnyStreamApi = StreamApi<AnyStreamMethods>;

/**
 * Helper to extract the method types from an API definition type
 */
export type inferStreamApiMethods<SomeApi extends AnyStreamApi> =
  SomeApi extends StreamApi<infer Methods> ? Methods : never;

/**
 * Creates a Grout stream API definition from a dictionary of methods.
 *
 * Example:
 *
 * ```ts
 *  const api = createStreamApi({
 *    async *watchStatus(): AsyncGenerator<string> {
 *      while (true) {
 *        yield 'OK';
 *      }
 *    },
 *  });
 * ```
 */
export function createStreamApi<Methods extends AnyStreamMethods>(
  methods: Methods
): StreamApi<Methods> {
  // Currently, we don't to actually need to do anything with the methods. By
  // calling createStreamApi, we're able to infer their type into TMethods, which
  // the client can use.
  return methods;
}

function createStreamHandler(
  path: string,
  methodName: string,
  method: () => AsyncIterator<unknown>,
  router: Express.Router
): void {
  debug(`Registering handler: ${path}`);

  // We also register a GET route for each method. This allows us to use
  // Server-Sent Events (SSE) to stream updates from the server to the client.
  router.get(path, (request, response) => {
    try {
      if (!request.accepts('text/event-stream')) {
        response.status(406).send('Not Acceptable');
        return;
      }

      debug(`[${methodName}] subscribe`);

      response.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // We need to send a dummy event to start the stream. This is required
      // by the SSE protocol, and also allows the client to detect if the
      // connection is lost.
      response.write('event: dummy\ndata: {}\n\n');

      let timeout: NodeJS.Timeout | undefined;
      const iterator = method();

      // eslint-disable-next-line no-inner-declarations
      async function tick() {
        try {
          const value = await iterator.next();
          response.write(`data: ${serialize(value)}\n\n`);

          // We use setTimeout rather than setInterval so that we don't send
          // updates if the client is slow to receive them. This is important
          // to ensure that the client doesn't get overwhelmed with updates.
          timeout = setTimeout(tick, 0);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          debug(`[${methodName}] SSE Error: ${message}`);
          // eslint-disable-next-line no-console
          console.error(error); // To aid debugging, log the full error with stack trace
          response.end(
            `event: error\ndata: ${JSON.stringify({ message })}\n\n`
          );
        }
      }

      request.on('close', () => {
        debug(`[${methodName}] unsubscribe`);
        clearTimeout(timeout);
        response.end();
      });

      void tick();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debug(`Error: ${message}`);
      // eslint-disable-next-line no-console
      console.error(error); // To aid debugging, log the full error with stack trace
      response.status(500).json({ message });
    }
  });
}

/**
 * Creates an express Router with a route handler for each stream method in a
 * Grout API. This allows you to easily mount the Grout API within a larger
 * Express app like so:
 *
 *  const api = createStreamApi({ ... methods ... });
 *  const app = express();
 *  app.use('/api', buildStreamRouter(api, express));
 *
 * All routes will use the GET HTTP method for use with Server-Sent Events
 * (SSE). This allows the client to subscribe to the stream and receive updates
 * as they occur. Data is serialized using Grout's serialization format (see the
 * serialization module for details). This allows requests to be human-readable
 * while still supporting richer types than plain JSON.
 *
 * Unexpected exceptions during the initial request will return a 500 status
 * code with a plain JSON response containing the error message. This will cause
 * the client to throw an exception. Unexpected exceptions during the stream
 * will generate an `error` event, which will cause the promise returned by
 * the async iterable to reject.
 *
 * You should NOT throw exceptions from your methods for known errors (e.g.
 * invalid input). Instead, use the Result type to return known errors.  This
 * ensures that consumers of the method will be forced to handle that error case
 * explicitly.
 */
export function buildStreamRouter(
  api: AnyStreamApi,
  // We take the Express module as an argument so that Grout doesn't depend on
  // Express directly. This allows client packages to use Grout without having
  // to install Express, and also makes sure we're using the exact same version
  // of Express as the server package.
  express: typeof Express
): Express.Router {
  const router = express.Router();
  router.use(
    express.text({
      type: 'application/json',
      limit: '10mb', // Allow large-ish payloads like election definitions
    })
  );

  for (const [methodName, method] of Object.entries<AnyStreamMethod>(api)) {
    const path = `/${methodName}`;
    if (!isAsyncGeneratorFunction(method)) {
      throw new GroutError(
        `Stream router only works with async iterable functions. Use buildRpcRouter instead for functions that produce a single output. ` +
          `Method: ${methodName}`
      );
    }

    if (method.length !== 0) {
      throw new GroutError(
        `Stream methods must take no arguments. Method: ${methodName}`
      );
    }

    createStreamHandler(
      path,
      methodName,
      method as () => AsyncIterator<unknown>,
      router
    );
  }

  return router;
}
