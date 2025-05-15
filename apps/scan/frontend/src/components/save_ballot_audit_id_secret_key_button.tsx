import React from 'react';
import { Button, Modal, P } from '@votingworks/ui';
import { saveBallotAuditIdSecretKey } from '../api';

export function SaveBallotAuditIdSecretKeyButton(): JSX.Element {
  const saveBallotAuditIdSecretKeyMutation =
    saveBallotAuditIdSecretKey.useMutation();

  function onClose() {
    saveBallotAuditIdSecretKeyMutation.reset();
  }

  const result = saveBallotAuditIdSecretKeyMutation.data;

  return (
    <React.Fragment>
      <Button
        disabled={saveBallotAuditIdSecretKeyMutation.isLoading}
        onPress={() => saveBallotAuditIdSecretKeyMutation.mutate()}
      >
        Save Ballot Audit ID Secret Key
      </Button>
      {result?.isOk() && (
        <Modal
          title="Ballot Audit ID Secret Key Saved"
          content={
            <P>
              The ballot audit ID secret key has been saved on the inserted USB
              drive.
            </P>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      )}
      {result?.isErr() && (
        <Modal
          title="Failed to Save Ballot Audit ID Secret Key"
          content={<P>{result.err().message}</P>}
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      )}
    </React.Fragment>
  );
}
