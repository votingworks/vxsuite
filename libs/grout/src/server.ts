import type Express from 'express';
import { isObject, isString } from '@votingworks/basics';
import { rootDebug } from './debug';
import { serialize, deserialize } from './serialization';

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
export type inferApiMethods<SomeApi extends AnyApi> = SomeApi extends Api<
  infer Methods
>
  ? Methods
  : never;

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
 * Creates an express Router with a route handler for each RPC method in a Grout
 * API. This allows you to easily mount the Grout API within a larger Express
 * app like so:
 *
 *  const api = createApi({ ... methods ... });
 *  const app = express();
 *  app.use('/api', buildRouter(api, express));
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

  for (const [methodName, method] of Object.entries<AnyRpcMethod>(api)) {
    const path = `/${methodName}`;
    debug(`Registering route: ${path}`);

    // All routes use the POST method. This doesn't quite follow the traditional
    // semantics of HTTP, since there may or may not be a side-effect. But it's
    // better to err on the side of possible side-effects (as opposed to use GET).
    // We don't try to use the correct HTTP method because that would require
    // some way to annotate RPC methods with the appropriate method, which is
    // more complexity for little practical gain.
    router.post(path, async (request, response) => {
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

        const result = await method(input);
        const jsonResult = serialize(result);
        debug(`Result: ${jsonResult}`);

        response.set('Content-type', 'application/json');
        response.status(200).send(jsonResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debug(`Error: ${message}`);
        // eslint-disable-next-line no-console
        console.error(error); // To aid debugging, log the full error with stack trace
        response.status(500).json({ message });
      }
    });
  }

  return router;
}
