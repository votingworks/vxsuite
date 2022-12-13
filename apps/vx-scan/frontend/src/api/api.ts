/* eslint-disable vx/gts-no-import-export-type */
import type { Api } from '@votingworks/vx-scan-backend';
import * as grout from '@votingworks/grout';

const baseUrl = '/api';

export const apiClient = grout.createClient<Api>({ baseUrl });
