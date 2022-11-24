/* eslint-disable vx/gts-no-return-type-only-generics */
/* eslint-disable vx/gts-type-parameters */
/* eslint-disable vx/gts-identifiers */
import {
  AnyApi,
  AnyHandler,
  AnyMutationHandler,
  AnyQueryHandler,
  Api,
  Handler,
  methodPath,
} from './api';

type inferApiDefinition<TApi extends AnyApi> = TApi extends Api<
  infer TDefinition
>
  ? TDefinition
  : never;

type inferHandlerFunction<THandler extends AnyHandler> =
  THandler extends Handler<infer TFunction> ? TFunction : never;

type PickByValue<TObj, TValue> = Pick<
  TObj,
  { [K in keyof TObj]: TObj[K] extends TValue ? K : never }[keyof TObj]
>;

type ApiQueries<TApi extends AnyApi> = PickByValue<
  inferApiDefinition<TApi>,
  AnyQueryHandler
>;

type ApiMutations<TApi extends AnyApi> = PickByValue<
  inferApiDefinition<TApi>,
  AnyMutationHandler
>;

type ClientQueries<TApi extends AnyApi> = {
  [MethodName in keyof ApiQueries<TApi>]: inferHandlerFunction<
    ApiQueries<TApi>[MethodName]
  >;
};

type ClientMutations<TApi extends AnyApi> = {
  [MethodName in keyof ApiMutations<TApi>]: inferHandlerFunction<
    ApiMutations<TApi>[MethodName]
  >;
};

export interface Client<TApi extends AnyApi> {
  queries: ClientQueries<TApi>;
  mutations: ClientMutations<TApi>;
}

export function createClient<TApi extends AnyApi>(): Client<TApi> {
  return {
    queries: new Proxy({} as unknown as ClientQueries<TApi>, {
      get(_target, methodName: string) {
        // TODO handle args for queries
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return async (..._args: unknown[]) => {
          const response = await fetch(methodPath(methodName));
          return await response.json();
        };
      },
    }),
    mutations: new Proxy({} as unknown as ClientMutations<TApi>, {
      get(_target, methodName: string) {
        return async (...args: unknown[]) => {
          const response = await fetch(methodPath(methodName), {
            method: 'POST',
            body: JSON.stringify(args),
            headers: { 'Content-Type': 'application/json' },
          });
          const responseText = await response.text();
          if (responseText) {
            return JSON.parse(responseText);
          }
        };
      },
    }),
  };
}
