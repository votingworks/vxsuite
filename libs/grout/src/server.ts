/* eslint-disable no-underscore-dangle */
import type Express from 'express';
import {
  assert,
  extractErrorMessage,
  isObject,
  isString,
} from '@votingworks/basics';
import { rootDebug } from './debug';
import { serialize, deserialize } from './serialization';

const debug = rootDebug.extend('server');
const perfDebug = debug.extend('perf');

/**
 * A Grout RPC method.
 *
 * A method must take either no arguments or a single object argument (which
 * is intended to be used as a dictionary of named parameters) as well as an
 * optional context argument (to be filled in by middleware). It may be either
 * sync or async (i.e. return a plain value or a Promise).
 *
 * Method input and output values must be serializable to JSON and
 * deserializable from JSON. Grout supports built-in JSON types as well as some
 * extras (e.g. undefined, Error, Result). See the serialization module for
 * specifics.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRpcMethod = (input: any, context?: any) => any;
// Notes(jonah):
// - We can't enforce the constraints on method input at compile time, because
//  function argument subtyping is contravariant, meaning that for an RPC method to
//  be a subtype of AnyRpcMethod, its input must be a supertype of
//  Parameters<AnyRPCMethod>. Maybe there's another approach that would work,
//  but I couldn't figure it out. Instead I opted to just put in runtime checks
//  during serialization/deserialization.
//
// - Having one single input argument object means that input parameters will be
//  named in the serialized JSON, which will hopefully make it more
//  human-readable and ease debugging.

/**
 * Base type for any context object created by middleware (to be passed to the
 * RPC method).
 */
export type AnyContext = object;

/**
 * Base type for any method dictionary passed to createApi.
 */
export interface AnyMethods {
  [methodName: string]: AnyRpcMethod;
}

/**
 * Type for a specific API definition returned by createApi.
 */
export interface Api<
  Methods extends AnyMethods,
  Context extends AnyContext = AnyContext,
> {
  // eslint-disable-next-line vx/gts-jsdoc
  /** @private Grout internal use only */
  _methods: Methods;
  // eslint-disable-next-line vx/gts-jsdoc
  /** @private Grout internal use only */
  _middlewares?: Array<Middleware<Context>>;
  /**
   * Expose `methods()` for testing the API methods directly without having to
   * run a server. Note that using this approach will bypass any middleware, so
   * it's not recommended for most testing.
   */
  methods(): Readonly<Methods>;
}

/**
 * Base type for any API definition.
 */
export type AnyApi = Api<AnyMethods, AnyContext>;

/**
 * Helper to extract the method types from an API definition type
 */
export type inferApiMethods<SomeApi extends AnyApi> = SomeApi extends Api<
  infer Methods,
  AnyContext
>
  ? Methods
  : never;

/**
 * Info about a method call that is passed to middleware.
 */
export interface MiddlewareMethodCall<Context extends AnyContext> {
  methodName: string;
  input?: object;
  request: Express.Request;
  /**
   * When a given middleware is called, the Context fields may not have been
   * filled out by other middleware yet, so we can't get any guarantees from the
   * type system.
   */
  context: Partial<Context>;
}

/**
 * A function that can be run before the RPC method when it's called. Example applications:
 * - Authentication/loading user data
 * - Logging
 *
 * Middleware functions are run in sequence. Each middleware can extend and
 * return the context object, which will be passed to the next middleware (and
 * eventually, to the RPC method). If a middleware function returns void, the
 * context will be unchanged.
 */
export type Middleware<Context extends AnyContext> = (
  methodCall: MiddlewareMethodCall<Context>
) => Context | void | Promise<Context | void>;

/**
 * Creates a Grout API definition from a dictionary of methods and array of
 * middleware.
 *
 * Example:
 *
 * ```
 * const api = createApi({
 *   async sayHello({ name }: { name: string }): Promise<string> {
 *     return `Hello, ${name}!`;
 *   },
 * }, [logApiCall])
 * ```
 *
 */
export function createApi<
  Methods extends AnyMethods,
  Context extends AnyContext,
>(
  methods: Methods,
  middlewares?: Array<Middleware<Context>>
): Api<Methods, Context> {
  // Currently, we don't to actually need to do anything with the methods. By
  // calling createApi, we're able to infer their type into Methods, which the
  // client can use.
  return {
    _methods: methods,
    _middlewares: middlewares,
    methods(): Readonly<Methods> {
      assert(process.env.NODE_ENV === 'test');
      return methods;
    },
  };
}

/**
 * Errors that are intended to catch misuse of Grout during development, rather
 * than runtime issues in production.
 */
export class GroutError extends Error {}

/**
 * Creates an express Router with a route handler for each RPC method in a Grout
 * API. This allows you to easily mount the Grout API within a larger Express
 * app like so:
 *
 * ```
 * const api = createApi({ ... methods ... }, middlewares);
 * const app = express();
 * app.use('/api', buildRouter(api, express));
 * ```
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
export function buildRouter(
  api: AnyApi,
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

  for (const [methodName, method] of Object.entries<AnyRpcMethod>(
    api._methods
  )) {
    const path = `/${methodName}`;
    debug(`Registering route: ${path}`);

    // Create a debug instance specific to this method
    const methodDebug = perfDebug.extend(methodName);

    // All routes use the POST method. This doesn't quite follow the traditional
    // semantics of HTTP, since there may or may not be a side-effect. But it's
    // better to err on the side of possible side-effects (as opposed to use GET).
    // We don't try to use the correct HTTP method because that would require
    // some way to annotate RPC methods with the appropriate method, which is
    // more complexity for little practical gain.
    router.post(path, async (request, response, next) => {
      try {
        debug(`Call: ${methodName}(${request.body})`);
        if (!isString(request.body)) {
          throw new GroutError(
            'Request body was parsed as something other than a string.' +
              " Make sure you haven't added any other body parsers upstream" +
              ' of the Grout router - e.g. app.use(express.json()).' +
              ` Body: ${JSON.stringify(request.body)}`
          );
        }

        const input = deserialize(request.body);

        if (!(isObject(input) || input === undefined)) {
          throw new GroutError(
            'Grout methods must be called with an object or undefined as the sole argument.' +
              ` The argument received was: ${JSON.stringify(input)}`
          );
        }

        const durationStart = Date.now();
        let context: AnyContext = {};
        for (const middleware of api._middlewares ?? []) {
          const result = await middleware({
            methodName,
            input,
            request,
            context,
          });
          if (result !== undefined) {
            context = result;
          }
        }

        const result = await method(input, context);
        const jsonResult = serialize(result);
        debug(`Result: ${jsonResult}`);
        methodDebug(
          `Grout call to ${methodName} returned in ${
            Date.now() - durationStart
          }ms`
        );

        response.set('Content-type', 'application/json');
        response.status(200).send(jsonResult);
        next();
      } catch (error) {
        const message = extractErrorMessage(error);
        debug(`Error: ${message}`);
        // eslint-disable-next-line no-console
        console.error(error); // To aid debugging, log the full error with stack trace
        response.status(500).json({ message });
        next(error);
      }
    });
  }

  return router;
}
