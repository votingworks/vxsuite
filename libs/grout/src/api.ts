/* eslint-disable vx/gts-identifiers */
/* eslint-disable vx/gts-type-parameters */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type AsyncFunction = (...args: any[]) => Promise<any>;

export interface QueryHandler<THandler extends AsyncFunction> {
  type: 'query';
  handler: THandler;
}
export type AnyQueryHandler = QueryHandler<AsyncFunction>;

export interface MutationHandler<THandler extends AsyncFunction> {
  type: 'mutation';
  handler: THandler;
}
export type AnyMutationHandler = MutationHandler<AsyncFunction>;

export type Handler<THandler extends AsyncFunction> =
  | QueryHandler<THandler>
  | MutationHandler<THandler>;

export type AnyHandler = Handler<AsyncFunction>;

export function query<THandler extends AsyncFunction>(
  handler: THandler
): QueryHandler<THandler> {
  return { type: 'query', handler };
}

export function mutation<THandler extends AsyncFunction>(
  handler: THandler
): MutationHandler<THandler> {
  return { type: 'mutation', handler };
}

export interface AnyRoutes {
  [methodName: string]: AsyncFunction;
}

export function methodPath(methodName: string): string {
  return `/api/${methodName}`;
}

export type ApiDefinition<TRoutes extends AnyRoutes> = {
  [MethodName in keyof TRoutes]: Handler<TRoutes[MethodName]>;
};

export type AnyApiDefinition = ApiDefinition<AnyRoutes>;

export interface Api<TDefinition extends AnyApiDefinition> {
  apiDefinition: TDefinition;
}

export type AnyApi = Api<AnyApiDefinition>;

export function createApi<TDefinition extends AnyApiDefinition>(
  apiDefinition: TDefinition
): Api<TDefinition> {
  return { apiDefinition };
}
