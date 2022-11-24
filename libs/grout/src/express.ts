// eslint-disable-next-line vx/gts-no-import-export-type
import type { Application, Request, Response } from 'express';
import { AnyApi, AnyHandler, methodPath } from './api';

export function registerRoutes(api: AnyApi, app: Application): void {
  for (const [methodName, { type, handler }] of Object.entries<AnyHandler>(
    api.apiDefinition
  )) {
    // TODO JSON-RPC
    const path = methodPath(methodName);
    switch (type) {
      case 'query':
        app.get(path, async (request: Request, response: Response) => {
          // TODO how do we handle query params?
          const result = await handler(request.query);
          response.json(result);
        });
        break;
      case 'mutation':
        app.post(path, async (request: Request, response: Response) => {
          const result = await handler(...request.body);
          response.json(result);
        });
        break;
      default:
        throw new Error(`Unknown handler type: ${type}`);
    }
  }
}
