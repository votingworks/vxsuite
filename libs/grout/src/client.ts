import {
  AnyApi,
  AnyApiDefinition,
  Api,
  ApiDefinition,
  methodPath,
} from './api';

type inferApiRoutes<TDefinition extends AnyApiDefinition> =
  TDefinition extends ApiDefinition<infer TRoutes> ? TRoutes : never;

type inferApiDefinition<TApi extends AnyApi> = TApi extends Api<
  infer TDefinition
>
  ? TDefinition
  : never;

export type Client<TApi extends AnyApi> = inferApiRoutes<
  inferApiDefinition<TApi>
>;

export function createClient<TApi extends AnyApi>(): Client<TApi> {
  return new Proxy({} as Client<TApi>, {
    get(_target, methodName: string) {
      return async (...args: any[]) => {
        console.log({ methodName, args });
        const response = await fetch(methodPath(methodName));
        return await response.json();
      };
    },
  });
}
