import {
  Button,
  Caption,
  Card,
  H1,
  H2,
  H3,
  LabelledText,
  LoadingAnimation,
  MainContent,
  MainHeader,
  Modal,
  P,
} from '@votingworks/ui';
import { useHistory, useParams } from 'react-router-dom';
import React, { useCallback, useState } from 'react';
import type { Voter } from '@votingworks/pollbook-backend';
import { assertDefined } from '@votingworks/basics';
import { electionManagerRoutes, NoNavScreen } from './nav_screen';
import { getDeviceStatuses, getVoter, undoVoterCheckIn } from './api';
import { Column, Row } from './layout';
import {
  AddressChange,
  PartyName,
  VoterAddress,
  VoterName,
} from './shared_components';
import { UpdateAddressFlow } from './update_address_flow';
import { UpdateNameFlow } from './update_name_flow';
import { CheckInDetails } from './voter_search_screen';

interface Params {
  voterId: string;
}

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
              aria-label="reason for undoing check-in"
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

function VoterDetailsScreenLayout({
  children,
}: React.PropsWithChildren): JSX.Element {
  const history = useHistory();

  const onClose = useCallback(() => {
    history.push(electionManagerRoutes.voters.path);
  }, [history]);

  return (
    <NoNavScreen>
      <MainHeader>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Voter Details</H1>
          <Button icon="Delete" onPress={onClose} variant="primary">
            Close
          </Button>
        </Row>
      </MainHeader>
      <MainContent
        style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}
      >
        {children}
      </MainContent>
    </NoNavScreen>
  );
}

interface PrinterRequiredProps {
  onClose: () => void;
}
function PrinterRequired({
  children,
  onClose,
}: PrinterRequiredProps & React.PropsWithChildren) {
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  if (!getDeviceStatusesQuery.isSuccess) {
    return null;
  }

  const { printer } = getDeviceStatusesQuery.data;
  if (!printer.connected) {
    return (
      <Modal
        title="No Printer Detected"
        content={<P>Connect printer to continue.</P>}
        actions={<Button onPress={onClose}>Close</Button>}
        onOverlayClick={onClose}
      />
    );
  }

  return children;
}

export function VoterDetailsScreen(): JSX.Element | null {
  const { voterId } = useParams<Params>();
  const voterQuery = getVoter.useQuery(voterId);
  const [showUpdateAddressFlow, setShowUpdateAddressFlow] = useState(false);
  const [showUpdateNameFlow, setShowUpdateNameFlow] = useState(false);
  const [showUndoCheckinFlow, setShowUndoCheckinFlow] = useState(false);

  if (!voterQuery.isSuccess) {
    return (
      <VoterDetailsScreenLayout>
        <LoadingAnimation />
      </VoterDetailsScreenLayout>
    );
  }

  const voter = voterQuery.data;

  if (showUpdateAddressFlow) {
    return (
      <PrinterRequired onClose={() => setShowUpdateAddressFlow(false)}>
        <UpdateAddressFlow
          voter={voter}
          returnToPreviousScreen={() => setShowUpdateAddressFlow(false)}
          returnToPreviousScreenLabelText="Return to Voter Details"
        />
      </PrinterRequired>
    );
  }

  if (showUpdateNameFlow) {
    return (
      <PrinterRequired onClose={() => setShowUpdateNameFlow(false)}>
        <UpdateNameFlow
          voter={voter}
          returnToDetailsScreen={() => setShowUpdateNameFlow(false)}
        />
      </PrinterRequired>
    );
  }

  if (showUndoCheckinFlow) {
    return (
      <PrinterRequired onClose={() => setShowUndoCheckinFlow(false)}>
        <ConfirmUndoCheckInModal
          voter={voter}
          onClose={() => setShowUndoCheckinFlow(false)}
        />
      </PrinterRequired>
    );
  }

  return (
    <VoterDetailsScreenLayout>
      <React.Fragment>
        <Column style={{ gap: '1rem', flex: 1, flexBasis: 1 }}>
          <Card color="neutral">
            {voter.nameChange && (
              <div>
                <Caption>
                  <s>Name</s>
                </Caption>
                <H2 style={{ marginTop: 0 }}>
                  <s>
                    <VoterName voter={{ ...voter, nameChange: undefined }} />
                  </s>
                </H2>
              </div>
            )}
            {voter.nameChange && <Caption>Updated Name</Caption>}
            <H2 style={{ marginTop: 0 }}>
              <VoterName voter={voter} />
            </H2>
            <Column style={{ gap: '1rem' }}>
              <LabelledText label="Party">
                <PartyName party={voter.party} />
              </LabelledText>
              <Row style={{ gap: '1.5rem' }}>
                <LabelledText
                  label={voter.addressChange ? <s>Address</s> : 'Address'}
                >
                  <VoterAddress
                    voter={voter}
                    style={
                      voter.addressChange && {
                        textDecoration: 'line-through',
                      }
                    }
                  />
                </LabelledText>
                {voter.addressChange && (
                  <LabelledText label="Updated Address">
                    <AddressChange address={voter.addressChange} />
                  </LabelledText>
                )}
              </Row>
              <LabelledText label="Voter ID">{voter.voterId}</LabelledText>
            </Column>
          </Card>
          <Row style={{ gap: '0.5rem' }}>
            <Button icon="Edit" onPress={() => setShowUpdateNameFlow(true)}>
              Update Name
            </Button>
            <Button icon="Edit" onPress={() => setShowUpdateAddressFlow(true)}>
              Update Address
            </Button>
          </Row>
        </Column>
        <Column style={{ flex: 1, flexBasis: 1 }}>
          <Card color="neutral">
            <Column style={{ gap: '1rem' }}>
              {!voter.checkIn && (
                <H2 style={{ marginTop: 0 }}>Not checked in</H2>
              )}
              {voter.checkIn && (
                <React.Fragment>
                  <H2 style={{ marginTop: 0 }}>Checked in</H2>
                  <LabelledText label="Time">
                    {voter.checkIn.timestamp}
                  </LabelledText>
                  <LabelledText label="Machine">
                    {voter.checkIn.machineId}
                  </LabelledText>
                  {voter.checkIn.identificationMethod.type ===
                    'outOfStateLicense' && (
                    <React.Fragment>
                      <LabelledText label="Identification method">
                        Out of state driver&apos;s license
                      </LabelledText>
                      <LabelledText label="State">
                        {voter.checkIn.identificationMethod.state}
                      </LabelledText>
                    </React.Fragment>
                  )}
                  <Button
                    icon="Delete"
                    onPress={() => setShowUndoCheckinFlow(true)}
                  >
                    Undo check-in
                  </Button>
                </React.Fragment>
              )}
            </Column>
          </Card>
        </Column>
      </React.Fragment>
    </VoterDetailsScreenLayout>
  );
}
