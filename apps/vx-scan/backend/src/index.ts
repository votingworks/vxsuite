import * as server from './server';

if (require.main === module) {
  server.start();
}

export type { Config, ApiDefinition } from './server';
export type { Api, AnyApi, AnyRoutes } from './api-spec-lib';
