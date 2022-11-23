export type AsyncFunction = (...args: any[]) => Promise<any>;

export type QueryHandler<THandler extends AsyncFunction> = {
  type: 'query';
  handler: THandler;
};

export type MutationHandler<THandler extends AsyncFunction> = {
  type: 'mutation';
  handler: THandler;
};

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

export type AnyRoutes = {
  [methodName: string]: AsyncFunction;
};

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
