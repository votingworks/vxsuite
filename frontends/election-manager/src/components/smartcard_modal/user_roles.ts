import { throwIllegalValue } from '@votingworks/utils';
import { UserRole } from '@votingworks/types';

export function userRoleToReadableString(userRole: UserRole): string {
  switch (userRole) {
    case 'superadmin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'pollworker':
      return 'Poll Worker';
    case 'voter':
      return 'Voter';
    case 'cardless_voter':
      return 'Cardless Voter';
    default:
      throwIllegalValue(userRole);
  }
}
