import { isCardlessVoterAuth } from '@votingworks/utils';

import * as api from '../api';

export function useIsVoterAuth(): boolean {
  const authStatusQuery = api.getAuthStatus.useQuery();
  return authStatusQuery.isSuccess && isCardlessVoterAuth(authStatusQuery.data);
}
