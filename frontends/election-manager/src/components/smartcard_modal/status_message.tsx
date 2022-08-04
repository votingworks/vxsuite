import React from 'react';
import styled from 'styled-components';
import { Loading, Modal, Text } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/utils';
import { User, UserRole } from '@votingworks/types';

import { hyphenatePin } from './pins';
import { userRoleToReadableString } from './user_roles';

const TextLarge = styled(Text)`
  font-size: 1.5em;
`;

export type SmartcardAction = 'Program' | 'PinReset' | 'Unprogram';

interface SmartcardActionComplete {
  action: SmartcardAction;
  role: UserRole;
  status: 'Success' | 'Error';
}

interface SmartcardActionInProgress {
  action: SmartcardAction;
  role: UserRole;
  status: 'InProgress';
}

export type SmartcardActionStatus =
  | SmartcardActionComplete
  | SmartcardActionInProgress;

export function isSmartcardActionComplete(
  actionStatus?: SmartcardActionStatus
): actionStatus is SmartcardActionComplete {
  return actionStatus?.status === 'Success' || actionStatus?.status === 'Error';
}

export function isSmartcardActionInProgress(
  actionStatus?: SmartcardActionStatus
): actionStatus is SmartcardActionInProgress {
  return actionStatus?.status === 'InProgress';
}

interface SuccessOrErrorStatusMessageProps {
  actionStatus: SmartcardActionComplete;
  programmedUser?: User;
}

/**
 * SuccessOrErrorStatusMessage displays success and error status messages across smartcard modal
 * views
 */
export function SuccessOrErrorStatusMessage({
  actionStatus,
  programmedUser,
}: SuccessOrErrorStatusMessageProps): JSX.Element | null {
  const { action, status } = actionStatus;
  const actionRoleReadableString = userRoleToReadableString(actionStatus.role);

  if (status === 'Error') {
    let text: string;
    switch (action) {
      case 'Program': {
        text = `Error creating ${actionRoleReadableString} card.`;
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

  if (action === 'Program' && programmedUser) {
    // No need to include the programmed user role in these messages since it's so prominent
    // elsewhere on the screen
    return (
      <TextLarge success>
        {'passcode' in programmedUser ? (
          <React.Fragment>
            New card PIN is{' '}
            <strong>{hyphenatePin(programmedUser.passcode)}</strong>.
          </React.Fragment>
        ) : (
          <React.Fragment>New card created.</React.Fragment>
        )}
      </TextLarge>
    );
  }

  if (action === 'PinReset' && programmedUser && 'passcode' in programmedUser) {
    // No need to include the programmed user role in these messages since it's so prominent
    // elsewhere on the screen
    return (
      <TextLarge success>
        New card PIN is <strong>{hyphenatePin(programmedUser.passcode)}</strong>
        .
      </TextLarge>
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

interface InProgressStatusMessageProps {
  actionStatus: SmartcardActionInProgress;
}

/**
 * InProgressStatusMessage displays in-progress status messages across smartcard modal views
 */
export function InProgressStatusMessage({
  actionStatus,
}: InProgressStatusMessageProps): JSX.Element | null {
  const { action } = actionStatus;
  const actionRoleReadableString = userRoleToReadableString(actionStatus.role);

  let text: string;
  switch (action) {
    case 'Program': {
      text = `Creating ${actionRoleReadableString} card`;
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
  return (
    <Modal centerContent content={<Loading as="strong">{text}</Loading>} />
  );
}
