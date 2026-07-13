import React, { useContext, useState } from 'react';

import {
  Button,
  Icons,
  Loading,
  Modal,
  P,
  userReadableMessageFromExportError,
} from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';

import { assert, throwIllegalValue } from '@votingworks/basics';
import type { SendCastVoteRecordsToHostError } from '@votingworks/central-scan-backend';
import { AppContext } from '../contexts/app_context';
import {
  getHostConnectionInfo,
  getSendCvrsProgress,
  sendCastVoteRecordsToHost,
} from '../api';

export interface Props {
  onClose: () => void;
}

enum ModalState {
  ERROR = 'error',
  SENDING = 'sending',
  DONE = 'done',
  INIT = 'init',
}

function userReadableMessageFromSendError(
  error: SendCastVoteRecordsToHostError
): string {
  switch (error.type) {
    case 'no-host-connected':
      return 'No VxAdmin is connected. Check the network connection and try again.';
    case 'export-failed':
      return userReadableMessageFromExportError(error.error);
    case 'upload-failed':
      return `Failed to send CVRs to VxAdmin: ${error.message}`;
    // istanbul ignore next -- compile-time check
    default:
      throwIllegalValue(error);
  }
}

export function SendCvrsModal({ onClose }: Props): JSX.Element | null {
  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');
  const [sendResult, setSendResult] = useState<{
    newlyAdded: number;
    alreadyPresent: number;
  }>();

  const { auth } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const hostConnectionInfoQuery = getHostConnectionInfo.useQuery();
  const sendCvrsProgressQuery = getSendCvrsProgress.useQuery();
  const sendCastVoteRecordsToHostMutation =
    sendCastVoteRecordsToHost.useMutation();

  function sendCvrs() {
    setCurrentState(ModalState.SENDING);
    sendCastVoteRecordsToHostMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.isErr()) {
          setErrorMessage(userReadableMessageFromSendError(result.err()));
          setCurrentState(ModalState.ERROR);
        } else {
          setSendResult(result.ok());
          setCurrentState(ModalState.DONE);
        }
      },
    });
  }

  if (!hostConnectionInfoQuery.isSuccess) {
    return null;
  }

  const hostConnectionInfo = hostConnectionInfoQuery.data;

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        title="Failed to Send CVRs"
        content={<P>{errorMessage}</P>}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === ModalState.DONE) {
    assert(sendResult !== undefined);
    return (
      <Modal
        title="CVRs Sent"
        content={
          <P>
            VxAdmin loaded {sendResult.newlyAdded} new CVR
            {sendResult.newlyAdded === 1 ? '' : 's'}
            {sendResult.alreadyPresent > 0
              ? ` and ignored ${sendResult.alreadyPresent} previously sent CVR${
                  sendResult.alreadyPresent === 1 ? '' : 's'
                } `
              : ''}
            .
          </P>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === ModalState.SENDING) {
    const progress = sendCvrsProgressQuery.data;
    return (
      <Modal
        centerContent
        content={
          <Loading>
            {progress && progress.total > 0
              ? `Sending CVRs (${progress.sent} of ${progress.total})`
              : 'Sending CVRs'}
          </Loading>
        }
      />
    );
  }

  // istanbul ignore next -- compile-time check
  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  if (hostConnectionInfo.status !== 'connected-to-host') {
    return (
      <Modal
        title="VxAdmin Not Detected"
        content={
          <P>
            <Icons.Warning color="warning" /> A VxAdmin could not be found on
            the network. Check the network connection and try again.
          </P>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  return (
    <Modal
      title="Send CVRs"
      content={
        <P>
          CVRs will be sent to VxAdmin ({hostConnectionInfo.hostMachineId}) over
          the network and loaded automatically.
        </P>
      }
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          <Button icon="Upload" variant="primary" onPress={sendCvrs}>
            Send
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
