import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { renderHook } from '../test/react_testing_library';
import { useApiClient } from './api';

test('useApiClient', async () => {
  await suppressingConsoleOutput(() => {
    expect(() => {
      renderHook(() => useApiClient());
    }).toThrowError('ApiClientContext.Provider not found');
  });
});
