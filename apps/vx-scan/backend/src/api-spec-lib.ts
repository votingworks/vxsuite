import { Application, Request, RequestHandler, Response } from 'express';

type QueryHandler<THandler extends AsyncFunction> = {
  type: 'query';
  handler: THandler;
};

type MutationHandler<THandler extends AsyncFunction> = {
  type: 'mutation';
  handler: THandler;
};

type AnyHandler = QueryHandler<any> | MutationHandler<any>;

export type AnyRoutes = {
  [methodName: string]: AsyncFunction;
};

type Handlers<TRoutes extends AnyRoutes> = {
  [MethodName in keyof TRoutes]:
    | QueryHandler<TRoutes[MethodName]>
    | MutationHandler<TRoutes[MethodName]>;
};

// @ts-ignore
export interface Api<TRoutes extends AnyRoutes> {
  registerRoutes: (app: Application) => void;
}

type AsyncFunction = (...args: any[]) => Promise<any>;

export function queryHandler<THandler extends AsyncFunction>(
  handler: THandler
): QueryHandler<THandler> {
  return { type: 'query', handler };
}

export function mutationHandler<THandler extends AsyncFunction>(
  handler: THandler
): MutationHandler<THandler> {
  return { type: 'mutation', handler };
}

export function createApi<TRoutes extends AnyRoutes>(
  handlers: Handlers<TRoutes>
): Api<TRoutes> {
  return {
    registerRoutes(app: Application) {
      for (const [methodName, { type, handler }] of Object.entries<AnyHandler>(
        handlers
      )) {
        // TODO make a better route path
        const path = `/api/${methodName}`;
        switch (type) {
          case 'query':
            app.get(path, async (request, response) => {
              const result = await handler(request.query);
              response.json(result);
            });
            break;
          case 'mutation':
            app.post(path, async (request, response) => {
              const result = await handler(request.body);
              response.json(result);
            });
            break;
        }
      }
    },
  };
}

export type AnyApi = Api<AnyRoutes>;

type inferApiRoutes<TApi extends AnyApi> = TApi extends Api<infer TRoutes>
  ? TRoutes
  : never;

export type Client<TApi extends AnyApi> = inferApiRoutes<TApi>;

export function buildClient<TApi extends AnyApi>(): Client<TApi> {
  return new Proxy({} as Client<TApi>, {
    get(_target, methodName: string) {
      return async (...args: any[]) => {
        console.log({ methodName, args });
        const response = await fetch(`/api/${methodName}`);
        return await response.json();
      };
    },
  });
}
