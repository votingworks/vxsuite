import React from 'react';
import { Loading, Modal, Text } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/utils';
import { User, UserRole } from '@votingworks/types';

import { hyphenatePin } from './pins';
import { userRoleToReadableString } from './user_roles';

export interface SmartcardActionStatus {
  action: 'Program' | 'PinReset' | 'Unprogram';
  role: UserRole;
  status: 'Success' | 'Error' | 'InProgress';
}

interface Props {
  actionStatus: SmartcardActionStatus;
  programmedUser?: User;
}

/**
 * StatusMessage facilitates display of status messages across smartcard modal views
 */
export function StatusMessage({
  actionStatus,
  programmedUser,
}: Props): JSX.Element | null {
  const { action, status } = actionStatus;
  const actionRoleReadableString = userRoleToReadableString(actionStatus.role);

  if (status === 'Error') {
    let text: string;
    switch (action) {
      case 'Program': {
        text = `Error programming ${actionRoleReadableString} card.`;
        break;
      }
      case 'PinReset': {
        text = `Error resetting ${actionRoleReadableString} card PIN.`;
        break;
      }
      case 'Unprogram': {
        text = `Error unprogramming ${actionRoleReadableString} card.`;
        break;
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(action);
      }
    }
    return <Text error>{text} Please try again.</Text>;
  }

  if (status === 'InProgress') {
    let text: string;
    switch (action) {
      case 'Program': {
        text = `Programming ${actionRoleReadableString} card`;
        break;
      }
      case 'PinReset': {
        text = `Resetting ${actionRoleReadableString} card PIN`;
        break;
      }
      case 'Unprogram': {
        text = `Unprogramming ${actionRoleReadableString} card`;
        break;
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(action);
      }
    }
    return <Modal content={<Loading as="p">{text}</Loading>} />;
  }

  if (action === 'Program' && programmedUser) {
    return (
      <Text success>
        New {actionRoleReadableString} card has been programmed.
        {'passcode' in programmedUser && (
          <React.Fragment>
            <br />
            The card PIN is {hyphenatePin(programmedUser.passcode)}. Write this
            PIN down.
          </React.Fragment>
        )}
      </Text>
    );
  }

  if (action === 'PinReset' && programmedUser && 'passcode' in programmedUser) {
    return (
      <Text success>
        {actionRoleReadableString} card PIN has been reset.
        <br />
        The new PIN is {hyphenatePin(programmedUser.passcode)}. Write this PIN
        down.
      </Text>
    );
  }

  if (action === 'Unprogram') {
    return (
      <Text success>
        {actionRoleReadableString} card has been unprogrammed.
      </Text>
    );
  }

  return null;
}
