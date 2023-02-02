import { DippedSmartCardAuth } from '@votingworks/types';
import { fakeSystemAdministratorUser } from '@votingworks/test-utils';
import { renderHook } from '@testing-library/react-hooks';
import { waitFor } from '@testing-library/react';

import {
  ApiClient,
  useDippedSmartCardAuth,
} from './use_dipped_smart_card_auth';

test('useDippedSmartCardAuth polls auth status', async () => {
  const user = fakeSystemAdministratorUser();
  let authStatus: DippedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user,
    programmableCard: { status: 'no_card' },
  };
  const apiClient: ApiClient = {
    getAuthStatus: () => Promise.resolve(authStatus),
  };
  const { result } = renderHook(() => useDippedSmartCardAuth(apiClient));

  expect(result.current).toMatchObject({
    status: 'logged_out',
    reason: 'machine_locked',
  });

  authStatus = { status: 'checking_passcode', user };
  await waitFor(() => {
    expect(result.current).toMatchObject({ status: 'checking_passcode', user });
  });
});
