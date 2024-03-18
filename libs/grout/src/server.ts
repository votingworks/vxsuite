import { assert, assertDefined } from '@votingworks/basics';
import { ServeOptions } from 'bun';
import { rootDebug } from './debug';
import { deserialize, serialize } from './serialization';
import { isObject } from './util';

const debug = rootDebug.extend('server');

/**
 * A Grout RPC method.
 *
 * A method must take either no arguments or a single object argument (which
 * is intended to be used as a dictionary of named parameters). It may be either
 * sync or async (i.e. return a plain value or a Promise).
 *
 * Method input and output values must be serializable to JSON and
 * deserializable from JSON. Grout supports built-in JSON types as well as some
 * extras (e.g. undefined, Error, Result). See the serialization module for
 * specifics.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRpcMethod = (input: any) => any;
// Notes(jonah):
// - We can't enforce the constraints on method input at compile time, because
//  function argument subtyping is contravariant, meaning that for an RPC method to
//  be a subtype of AnyRpcMethod, its input must be a supertype of
//  Parameters<AnyRPCMethod>. Maybe there's another approach that would work,
//  but I couldn't figure it out. Instead I opted to just put in runtime checks
//  during serialization/deserialization.
//
// - There are a few reasons behind having one single input argument object:
//   - Input parameters will be named in the serialized JSON, which will
//   hopefully make it more human-readable and ease debugging.
//   - If we ever need to extend Grout to inject extra metadata into the RPC
//   methods (e.g. accessing the current user via req.session), we can extend
//   the input object with special fields. It's less straightforward to do this
//   with a list of arguments.

/**
 * Base type for any method dictionary passed to createApi.
 */
export interface AnyMethods {
  [methodName: string]: AnyRpcMethod;
}

/**
 * Type for a specific API definition returned by createApi.
 */
export type Api<Methods extends AnyMethods> = Methods;

/**
 * Base type for any API definition.
 */
export type AnyApi = Api<AnyMethods>;

/**
 * Helper to extract the method types from an API definition type
 */
export type inferApiMethods<SomeApi extends AnyApi> =
  SomeApi extends Api<infer Methods> ? Methods : never;

/**
 * Creates a Grout API definition from a dictionary of methods.
 *
 * Example:
 *
 *  const api = createApi({
 *    async sayHello({ name }: { name: string }): Promise<string> {
 *      return `Hello, ${name}!`;
 *    },
 *  })
 *
 */
export function createApi<Methods extends AnyMethods>(
  methods: Methods
): Api<Methods> {
  // Currently, we don't to actually need to do anything with the methods. By
  // calling createApi, we're able to infer their type into TMethods, which the
  // client can use.
  return methods;
}

/**
 * Errors that are intended to catch misuse of Grout during development, rather
 * than runtime issues in production.
 */
export class GroutError extends Error {}

/**
 * Creates an object suitable for passing to `Bun.serve` with a route handler
 * for each RPC method in a Grout API.
 *
 * All routes will use the POST HTTP method with a JSON body (for RPC input) and
 * return a JSON response (for RPC output), using Grout's serialization format
 * (see the serialization module for details). This allows requests to be
 * human-readable while still supporting richer types than plain JSON.
 *
 * Unexpected exceptions will return a 500 status code with a plain JSON
 * response containing the error message. This will cause the client to throw an
 * exception.
 *
 * You should NOT throw exceptions from your RPC methods for known errors (e.g.
 * invalid input). Instead, use the Result type to return known errors.  This
 * ensures that consumers of the method will be forced to handle that error case
 * explicitly.
 */
export function buildRouter(api: AnyApi, prefix: string): ServeOptions {
  assert(prefix.startsWith('/'), 'Prefix must start with a slash');
  const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`;

  return {
    async fetch(request) {
      try {
        const url = new URL(request.url);

        if (!url.pathname.startsWith(prefixWithSlash)) {
          return new Response('Not Found', { status: 404 });
        }

        if (request.method !== 'POST') {
          return new Response('Method Not Allowed', { status: 405 });
        }

        if (request.headers.get('content-type') !== 'application/json') {
          return new Response('Unsupported Media Type', { status: 415 });
        }

        if (request.headers.get('accept') !== 'application/json') {
          return new Response('Not Acceptable', { status: 406 });
        }

        const contentLengthHeader = request.headers.get('content-length');
        // eslint-disable-next-line vx/gts-safe-number-parse
        const contentLength = Number(contentLengthHeader);

        // cap the payload size at 10MB
        if (Number.isNaN(contentLength) || contentLength > 10 * 1024 * 1024) {
          return new Response('Payload Too Large', { status: 413 });
        }

        const methodName = url.pathname.slice(prefixWithSlash.length);

        if (!Object.hasOwn(api, methodName)) {
          return new Response('Not Found', { status: 404 });
        }

        const method = assertDefined(api[methodName]);
        const body = await request.text();
        const input = deserialize(body);

        if (!isObject(input) && input !== undefined) {
          throw new GroutError(
            'Grout methods must be called with an object or undefined as the sole argument.' +
              ` The argument received was: ${JSON.stringify(input)}`
          );
        }

        const result = await method(input);

        if (result?.[Symbol.asyncIterator]) {
          const iterator = result[Symbol.asyncIterator]();
          return new Response(
            new ReadableStream({
              async start(controller) {
                for await (const chunk of iterator) {
                  if (request.signal.aborted) {
                    break;
                  }
                  controller.enqueue(`data: ${serialize(chunk)}`);
                }
              },
            }),
            {
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
              },
            }
          );
        }

        const jsonResult = serialize(result);
        debug(`Result: ${jsonResult}`);

        return new Response(jsonResult, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debug(`Error: ${message}`);
        // eslint-disable-next-line no-console
        console.error(error); // To aid debugging, log the full error with stack trace
        return new Response(JSON.stringify({ message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    },
  };
}
