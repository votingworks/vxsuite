import { createApi, query, mutation } from './api';
import { createClient } from './client';
import * as express from './express';

export * from './client';
export * from './api';
export * as express from './express';

// eslint-disable-next-line vx/gts-no-default-exports, vx/gts-direct-module-export-access-only
export default { createApi, query, mutation, createClient, express };
