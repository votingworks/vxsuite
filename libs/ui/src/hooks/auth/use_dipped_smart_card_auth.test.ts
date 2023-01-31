import { DippedSmartCardAuth } from '@votingworks/types';
import { fakeSystemAdministratorUser } from '@votingworks/test-utils';
import { renderHook } from '@testing-library/react-hooks';
import { waitFor } from '@testing-library/react';

import {
  AuthApiClient,
  useDippedSmartCardAuth,
} from './use_dipped_smart_card_auth';

test('useDippedSmartCardAuth logs out once on mount and then polls auth status', async () => {
  const user = fakeSystemAdministratorUser();
  let authStatus: DippedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user,
    programmableCard: { status: 'no_card' },
  };
  const authApiClient: AuthApiClient = {
    getAuthStatus: () => Promise.resolve(authStatus),
    logOut: () => {
      authStatus = { status: 'logged_out', reason: 'machine_locked' };
      return Promise.resolve();
    },
  };
  jest.spyOn(authApiClient, 'logOut');

  const { result } = renderHook(() => useDippedSmartCardAuth(authApiClient));

  expect(authApiClient.logOut).toHaveBeenCalledTimes(1);
  expect(result.current).toMatchObject({
    status: 'logged_out',
    reason: 'machine_locked',
  });

  authStatus = { status: 'checking_passcode', user };

  await waitFor(() => {
    expect(result.current).toMatchObject({ status: 'checking_passcode', user });
  });
  expect(authApiClient.logOut).toHaveBeenCalledTimes(1); // Expect no additional calls
});
