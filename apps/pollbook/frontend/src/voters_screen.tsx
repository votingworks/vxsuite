import {
  MainContent,
  Button,
  Font,
  Icons,
  Modal,
  P,
  Card,
  H3,
} from '@votingworks/ui';
import React, { useState } from 'react';
import type { Voter } from '@votingworks/pollbook-backend';
import { assertDefined } from '@votingworks/basics';
import { undoVoterCheckIn } from './api';
import { Column, Row } from './layout';
import { ElectionManagerNavScreen } from './nav_screen';
import { VoterSearch, CheckInDetails } from './voter_search_screen';
import { VoterName } from './shared_components';

function ConfirmUndoCheckInModal({
  voter,
  onClose,
}: {
  voter: Voter;
  onClose: () => void;
}): JSX.Element {
  const undoVoterCheckInMutation = undoVoterCheckIn.useMutation();
  const [reason, setReason] = useState('');

  return (
    <Modal
      title={<React.Fragment>Undo Check-In</React.Fragment>}
      content={
        <Column style={{ gap: '1rem' }}>
          <Card color="neutral">
            <Row
              style={{
                gap: '0.5rem',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <H3>
                  <VoterName voter={voter} />
                </H3>
              </div>
              <CheckInDetails checkIn={assertDefined(voter.checkIn)} />
            </Row>
          </Card>
          <Column>
            <P>Record the reason for undoing the check-in:</P>
            <textarea
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={250}
            />
          </Column>
        </Column>
      }
      actions={
        <React.Fragment>
          <Button
            icon="Delete"
            variant="danger"
            onPress={() => {
              undoVoterCheckInMutation.mutate(
                {
                  voterId: voter.voterId,
                  reason,
                },
                { onSuccess: onClose }
              );
            }}
            disabled={
              reason.trim() === '' || undoVoterCheckInMutation.isLoading
            }
          >
            Undo Check-In
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}

export function VotersScreen(): JSX.Element {
  const [voterToUndo, setVoterToUndo] = useState<Voter>();

  return (
    <ElectionManagerNavScreen title="Voters">
      <MainContent>
        <VoterSearch
          renderAction={(voter) =>
            voter.checkIn ? (
              <Column style={{ gap: '0.5rem' }}>
                <CheckInDetails checkIn={voter.checkIn} />
                <Button
                  style={{ flexWrap: 'nowrap' }}
                  icon="Delete"
                  color="danger"
                  onPress={() => setVoterToUndo(voter)}
                >
                  <Font noWrap>Undo Check-In</Font>
                </Button>
              </Column>
            ) : (
              <Row style={{ gap: '0.5rem' }}>
                <Font noWrap>
                  <Icons.X /> Not Checked In
                </Font>
              </Row>
            )
          }
        />
      </MainContent>
      {voterToUndo && (
        <ConfirmUndoCheckInModal
          voter={voterToUndo}
          onClose={() => setVoterToUndo(undefined)}
        />
      )}
    </ElectionManagerNavScreen>
  );
}
