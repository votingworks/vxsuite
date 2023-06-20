import React from 'react';
import styled from 'styled-components';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { UserRole } from '@votingworks/types';
import { Font, Icons, Loading, Modal, P } from '@votingworks/ui';
import { hyphenatePin } from '@votingworks/utils';

import { userRoleToReadableString } from './user_roles';

const TextLarge = styled(P)`
  font-size: 1.5em;
`;

export type SmartcardAction = 'Program' | 'PinReset' | 'Unprogram';

interface SmartcardActionComplete {
  action: SmartcardAction;
  newPin?: string;
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

interface Props {
  actionStatus: SmartcardActionComplete;
}

/**
 * SuccessOrErrorStatusMessage displays success and error status messages across smartcard modal
 * views
 */
export function SuccessOrErrorStatusMessage({
  actionStatus,
}: Props): JSX.Element | null {
  const { action, newPin, status } = actionStatus;
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
    return (
      <P>
        <Font color="danger">
          <Icons.Danger />
        </Font>{' '}
        {text} Please try again.
      </P>
    );
  }

  if (action === 'Program') {
    return (
      <TextLarge color="success">
        {newPin ? (
          <React.Fragment>
            New card PIN is <Font weight="bold">{hyphenatePin(newPin)}</Font>.
          </React.Fragment>
        ) : (
          <React.Fragment>New card created.</React.Fragment>
        )}
      </TextLarge>
    );
  }

  if (action === 'PinReset') {
    assert(newPin !== undefined);
    return (
      <TextLarge color="success">
        New card PIN is <Font weight="bold">{hyphenatePin(newPin)}</Font>.
      </TextLarge>
    );
  }

  if (action === 'Unprogram') {
    return (
      <P color="success">
        {actionRoleReadableString} card has been unprogrammed.
      </P>
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

  let text: string;
  switch (action) {
    case 'Program': {
      text = 'Programming card';
      break;
    }
    case 'PinReset': {
      text = 'Resetting card PIN';
      break;
    }
    case 'Unprogram': {
      text = 'Unprogramming card';
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(action);
    }
  }
  return <Modal centerContent content={<Loading>{text}</Loading>} />;
}
