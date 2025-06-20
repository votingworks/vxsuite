import {
  Button,
  Caption,
  Card,
  H1,
  H2,
  H3,
  Icons,
  LabelledText,
  Loading,
  LoadingAnimation,
  MainContent,
  MainHeader,
  Modal,
  P,
} from '@votingworks/ui';
import { useHistory, useParams } from 'react-router-dom';
import React, { useCallback, useState } from 'react';
import type { Voter } from '@votingworks/pollbook-backend';
import { assertDefined, sleep, assert } from '@votingworks/basics';
import { PrinterStatus } from '@votingworks/types';
import { electionManagerRoutes, NoNavScreen } from './nav_screen';
import {
  getDeviceStatuses,
  getVoter,
  reprintVoterReceipt,
  markVoterInactive,
  undoVoterCheckIn,
  getPollbookConfigurationInformation,
} from './api';
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
import { PRINTING_INDICATOR_DELAY_MS } from './globals';

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

function ConfirmMarkInactiveModal({
  voter,
  onClose,
}: {
  voter: Voter;
  onClose: () => void;
}): JSX.Element {
  const markInactiveMutation = markVoterInactive.useMutation();
  const [errorMessage, setErrorMessage] = useState('');

  if (errorMessage) {
    assert(errorMessage === 'voter_checked_in');
    return (
      <Modal
        title={<React.Fragment>Error Marking Inactive</React.Fragment>}
        content="This voter is already checked in and cannot be marked as inactive."
        actions={<Button onPress={onClose}>Cancel</Button>}
        onOverlayClick={onClose}
      />
    );
  }
  return (
    <Modal
      title={<React.Fragment>Mark Voter as Inactive</React.Fragment>}
      content="After the voter is marked as inactive, it will not be possible to check them in. This action cannot be undone."
      actions={
        <React.Fragment>
          <Button
            icon="Delete"
            variant="danger"
            onPress={async () => {
              const result = await markInactiveMutation.mutateAsync({
                voterId: voter.voterId,
              });
              if (result.isOk()) {
                onClose();
              } else {
                setErrorMessage(result.err());
              }
            }}
          >
            Mark Inactive
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
  printer: PrinterStatus;
  onClose: () => void;
}
function PrinterRequired({
  printer,
  children,
  onClose,
}: PrinterRequiredProps & React.PropsWithChildren) {
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
  const [showMarkInactiveFlow, setShowMarkInactiveFlow] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [reprintErrorMessage, setReprintErrorMessage] = useState('');
  const reprintVoterReceiptMutation = reprintVoterReceipt.useMutation();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const getPollbookConfigurationInformationQuery =
    getPollbookConfigurationInformation.useQuery();

  async function reprintReceipt() {
    setIsPrinting(true);
    const result = await reprintVoterReceiptMutation.mutateAsync({
      voterId,
    });
    if (result.isOk()) {
      await sleep(PRINTING_INDICATOR_DELAY_MS);
      setIsPrinting(false);
      setReprintErrorMessage('');
    } else if (result.isErr()) {
      setIsPrinting(false);
      setReprintErrorMessage(result.err());
    }
  }

  if (
    !getDeviceStatusesQuery.isSuccess ||
    !getPollbookConfigurationInformationQuery.isSuccess
  ) {
    return null;
  }

  const { printer } = getDeviceStatusesQuery.data;
  const { configuredPrecinctId } =
    getPollbookConfigurationInformationQuery.data;

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
      <PrinterRequired
        printer={printer}
        onClose={() => setShowUpdateAddressFlow(false)}
      >
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
      <PrinterRequired
        printer={printer}
        onClose={() => setShowUpdateNameFlow(false)}
      >
        <UpdateNameFlow
          voter={voter}
          returnToDetailsScreen={() => setShowUpdateNameFlow(false)}
        />
      </PrinterRequired>
    );
  }

  if (showUndoCheckinFlow) {
    return (
      <PrinterRequired
        printer={printer}
        onClose={() => setShowUndoCheckinFlow(false)}
      >
        <ConfirmUndoCheckInModal
          voter={voter}
          onClose={() => setShowUndoCheckinFlow(false)}
        />
      </PrinterRequired>
    );
  }

  if (showMarkInactiveFlow) {
    return (
      <ConfirmMarkInactiveModal
        voter={voter}
        onClose={() => setShowMarkInactiveFlow(false)}
      />
    );
  }

  return (
    <VoterDetailsScreenLayout>
      {isPrinting && <Modal content={<Loading>Printing</Loading>} />}
      {reprintErrorMessage && (
        <Modal
          title="Error Reprinting"
          onOverlayClick={() => setReprintErrorMessage('')}
          actions={
            <Button onPress={() => setReprintErrorMessage('')}>Close</Button>
          }
          content="Voter is not currently checked in."
        />
      )}
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
            <Button
              icon="Edit"
              disabled={voter.isInactive || !configuredPrecinctId}
              onPress={() => setShowUpdateNameFlow(true)}
            >
              Update Name
            </Button>
            <Button
              icon="Edit"
              disabled={voter.isInactive || !configuredPrecinctId}
              onPress={() => setShowUpdateAddressFlow(true)}
            >
              Update Address
            </Button>
          </Row>
        </Column>
        <Column style={{ flex: 1, flexBasis: 1, gap: '1rem' }}>
          <Card color="neutral">
            <Column style={{ gap: '1rem' }}>
              {voter.isInactive && (
                <H2 style={{ marginTop: 0 }}>
                  <Icons.Disabled /> Inactive
                </H2>
              )}
              {!voter.checkIn && !voter.isInactive && (
                <H2 style={{ marginTop: 0 }}>Not checked in</H2>
              )}
              {voter.checkIn && !voter.isInactive && (
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
                </React.Fragment>
              )}
            </Column>
          </Card>
          {!voter.checkIn && !voter.isInactive && (
            <Button
              icon="Delete"
              color="danger"
              disabled={!configuredPrecinctId}
              onPress={() => setShowMarkInactiveFlow(true)}
            >
              Mark Voter as Inactive
            </Button>
          )}
          {voter.checkIn && !voter.isInactive && (
            <Row style={{ gap: '1rem' }}>
              <Button
                icon="Print"
                onPress={() => reprintReceipt()}
                disabled={!printer.connected}
              >
                Reprint Receipt
              </Button>
              <Button
                icon="Delete"
                onPress={() => setShowUndoCheckinFlow(true)}
              >
                Undo Check-In
              </Button>
            </Row>
          )}
        </Column>
      </React.Fragment>
    </VoterDetailsScreenLayout>
  );
}
