import { expect, test } from 'vitest';
import { getCvrTransferUploadPath } from './vx_admin_host_api.js';

test('getCvrTransferUploadPath encodes each path component', () => {
  expect(getCvrTransferUploadPath('CS-01', 'batch-1', 'cvr-1')).toEqual(
    '/api/cvr-transfer/CS-01/batch-1/cvr-1'
  );
  expect(getCvrTransferUploadPath('a b', 'x/y', 'c?d')).toEqual(
    '/api/cvr-transfer/a%20b/x%2Fy/c%3Fd'
  );
});
