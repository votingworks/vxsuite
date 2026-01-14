import {
  Button,
  ButtonBar,
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
import React, { useCallback, useEffect, useState } from 'react';
import { assertDefined, sleep, assert } from '@votingworks/basics';
import { PrinterStatus, Voter } from '@votingworks/types';
import { DateTime } from 'luxon';
import { electionManagerRoutes, NoNavScreen } from './nav_screen';
import {
  getDeviceStatuses,
  getVoter,
  reprintVoterReceipt,
  markVoterInactive,
  invalidateRegistration,
  undoVoterCheckIn,
  getPollbookConfigurationInformation,
  getElection,
} from './api';
import { Column, Row } from './layout';
import {
  AddressChange,
  PartyName,
  PrecinctName,
  VoterAddress,
  VoterName,
  VoterMailingAddress,
  hasMailingAddress,
  MailingAddressChange,
} from './shared_components';
import { UpdateAddressFlow } from './update_address_flow';
import { UpdateMailingAddressFlow } from './update_mailing_address_flow';
import { UpdateNameFlow } from './update_name_flow';
import { CheckInDetails } from './voter_search_screen';
import { PRINTING_INDICATOR_DELAY_MS } from './globals';
import { getVoterPrecinct } from './types';
import { partyAbbreviationToString } from './strings';

interface Params {
  voterId: string;
}

function ConfirmUndoCheckInModal({
  voter,
  onClose,
}: {
  voter: Voter;
  onClose: () => void;
}): JSX.Element | null {
  const undoVoterCheckInMutation = undoVoterCheckIn.useMutation();
  const [reason, setReason] = useState('');

  // the check-in may be undone at another poll book, or the modal may render
  // after the check-in has been undone at the current poll book
  useEffect(() => {
    if (!voter.checkIn) {
      onClose();
    }
  }, [voter.checkIn, onClose]);

  if (!voter.checkIn) {
    return null;
  }

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
              <CheckInDetails checkIn={voter.checkIn} />
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
        title={<React.Fragment>Error Flagging Inactive</React.Fragment>}
        content="This voter is already checked in and cannot be flagged as inactive."
        actions={<Button onPress={onClose}>Cancel</Button>}
        onOverlayClick={onClose}
      />
    );
  }
  return (
    <Modal
      title={<React.Fragment>Flag Voter as Inactive</React.Fragment>}
      content="After a voter is flagged as inactive, any attempt to check them in will produce a warning."
      actions={
        <React.Fragment>
          <Button
            icon="Flag"
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
            Flag Inactive
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}

function ConfirmInvalidateRegistrationModal({
  voter,
  onClose,
}: {
  voter: Voter;
  onClose: () => void;
}): JSX.Element {
  const invalidateRegistrationMutation = invalidateRegistration.useMutation();
  const [errorMessage, setErrorMessage] = useState('');

  if (errorMessage) {
    const errorContent =
      errorMessage === 'voter_checked_in'
        ? 'This voter is already checked in and cannot be marked as invalid.'
        : 'This voter is not a same-day registration.';
    return (
      <Modal
        title={<React.Fragment>Error Marking Invalid</React.Fragment>}
        content={errorContent}
        actions={<Button onPress={onClose}>Cancel</Button>}
        onOverlayClick={onClose}
      />
    );
  }
  return (
    <Modal
      title={<React.Fragment>Mark Registration Invalid</React.Fragment>}
      content="This voter’s information will be permanently deleted and removed from all related counts."
      actions={
        <React.Fragment>
          <Button
            icon="Delete"
            variant="danger"
            onPress={async () => {
              const result = await invalidateRegistrationMutation.mutateAsync({
                voterId: voter.voterId,
              });
              if (result.isOk()) {
                onClose();
              } else {
                setErrorMessage(result.err());
              }
            }}
          >
            Mark Invalid
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
        </Row>
      </MainHeader>
      <MainContent
        style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}
      >
        {children}
      </MainContent>
      <ButtonBar>
        <Button onPress={onClose} variant="primary">
          Close
        </Button>
      </ButtonBar>
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
  const [showUpdateMailingAddressFlow, setShowUpdateMailingAddressFlow] =
    useState(false);
  const [showUpdateNameFlow, setShowUpdateNameFlow] = useState(false);
  const [showUndoCheckinFlow, setShowUndoCheckinFlow] = useState(false);
  const [showMarkInactiveFlow, setShowMarkInactiveFlow] = useState(false);
  const [showInvalidateRegistrationFlow, setShowInvalidateRegistrationFlow] =
    useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [reprintErrorMessage, setReprintErrorMessage] = useState('');
  const reprintVoterReceiptMutation = reprintVoterReceipt.useMutation();
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const getPollbookConfigurationInformationQuery =
    getPollbookConfigurationInformation.useQuery();
  const getElectionQuery = getElection.useQuery();

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
    !getPollbookConfigurationInformationQuery.isSuccess ||
    !getElectionQuery.isSuccess
  ) {
    return null;
  }

  const { printer } = getDeviceStatusesQuery.data;
  const { configuredPrecinctId } =
    getPollbookConfigurationInformationQuery.data;
  const election = assertDefined(getElectionQuery.data.unsafeUnwrap());

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
          election={election}
        />
      </PrinterRequired>
    );
  }

  if (showUpdateMailingAddressFlow) {
    return (
      <PrinterRequired
        printer={printer}
        onClose={() => setShowUpdateMailingAddressFlow(false)}
      >
        <UpdateMailingAddressFlow
          voter={voter}
          returnToPreviousScreen={() => setShowUpdateMailingAddressFlow(false)}
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
      {showMarkInactiveFlow && (
        <ConfirmMarkInactiveModal
          voter={voter}
          onClose={() => setShowMarkInactiveFlow(false)}
        />
      )}
      {showInvalidateRegistrationFlow && (
        <ConfirmInvalidateRegistrationModal
          voter={voter}
          onClose={() => setShowInvalidateRegistrationFlow(false)}
        />
      )}
      {showUndoCheckinFlow && (
        <PrinterRequired
          printer={printer}
          onClose={() => setShowUndoCheckinFlow(false)}
        >
          <ConfirmUndoCheckInModal
            voter={voter}
            onClose={() => setShowUndoCheckinFlow(false)}
          />
        </PrinterRequired>
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
              {election.precincts.length > 1 && (
                <LabelledText label="Precinct">
                  <PrecinctName
                    precinctId={getVoterPrecinct(voter)}
                    election={election}
                  />
                </LabelledText>
              )}
              <Row style={{ gap: '1.5rem' }}>
                <LabelledText
                  style={{ width: '100%' }}
                  label={
                    voter.addressChange ? (
                      <s>Domicile Address</s>
                    ) : (
                      'Domicile Address'
                    )
                  }
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
                  <LabelledText
                    label="Updated Domicile Address"
                    style={{ width: '100%' }}
                  >
                    <AddressChange address={voter.addressChange} />
                  </LabelledText>
                )}
              </Row>
              {(hasMailingAddress(voter) || voter.mailingAddressChange) && (
                <Row style={{ gap: '1.5rem' }}>
                  {hasMailingAddress(voter) && (
                    <LabelledText
                      style={{ width: '100%' }}
                      label={
                        voter.mailingAddressChange ? (
                          <s>Mailing Address</s>
                        ) : (
                          'Mailing Address'
                        )
                      }
                    >
                      <VoterMailingAddress
                        voter={voter}
                        style={
                          voter.mailingAddressChange && {
                            textDecoration: 'line-through',
                          }
                        }
                      />
                    </LabelledText>
                  )}
                  {voter.mailingAddressChange && (
                    <LabelledText
                      label="Updated Mailing Address"
                      style={{ width: '100%' }}
                    >
                      <MailingAddressChange
                        address={voter.mailingAddressChange}
                      />
                    </LabelledText>
                  )}
                </Row>
              )}
              <LabelledText label="Voter ID">{voter.voterId}</LabelledText>
            </Column>
          </Card>
          <Row style={{ gap: '0.5rem' }}>
            <Button
              icon="Edit"
              disabled={
                !configuredPrecinctId ||
                configuredPrecinctId !== getVoterPrecinct(voter)
              }
              onPress={() => setShowUpdateNameFlow(true)}
            >
              Update Name
            </Button>
            <Button
              icon="Edit"
              disabled={
                !configuredPrecinctId ||
                configuredPrecinctId !== getVoterPrecinct(voter)
              }
              onPress={() => setShowUpdateAddressFlow(true)}
            >
              Update Domicile Address
            </Button>
          </Row>
          <Row>
            <Button
              icon="Edit"
              disabled={
                !configuredPrecinctId ||
                configuredPrecinctId !== getVoterPrecinct(voter)
              }
              onPress={() => setShowUpdateMailingAddressFlow(true)}
            >
              Update Mailing Address
            </Button>
          </Row>
        </Column>
        <Column style={{ flex: 1, flexBasis: 1, gap: '1rem' }}>
          <Card color="neutral">
            {voter.isInactive && !voter.checkIn && (
              <H2 style={{ marginTop: 0, marginBottom: 0 }}>
                <Icons.Flag /> Inactive
              </H2>
            )}
            {voter.isInvalidatedRegistration && !voter.checkIn && (
              <H2 style={{ marginTop: 0, marginBottom: 0 }}>
                <Icons.Delete /> Registration Invalid
              </H2>
            )}
            {!voter.checkIn &&
              !voter.isInactive &&
              !voter.isInvalidatedRegistration && (
                <H2 style={{ marginTop: 0, marginBottom: 0 }}>
                  <Icons.Info /> Not Checked In
                </H2>
              )}
            {voter.checkIn && (
              <React.Fragment>
                <H2 style={{ marginTop: 0 }}>
                  {voter.checkIn.isAbsentee ? (
                    <React.Fragment>
                      <Icons.Envelope /> Absentee Checked In
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <Icons.Done /> Checked In{' '}
                    </React.Fragment>
                  )}
                </H2>
                <Column style={{ gap: '1rem' }}>
                  <LabelledText label="Time">
                    {DateTime.fromISO(voter.checkIn.timestamp).toLocaleString({
                      ...DateTime.DATETIME_SHORT,
                      second: 'numeric',
                    })}
                  </LabelledText>
                  <LabelledText label="Poll Book">
                    {voter.checkIn.machineId}
                  </LabelledText>
                  {voter.checkIn.identificationMethod.type ===
                    'outOfStateLicense' && (
                    <LabelledText label="Identification Method">
                      Out-of-State ID (
                      {voter.checkIn.identificationMethod.state})
                    </LabelledText>
                  )}
                  {election.type === 'primary' && (
                    <LabelledText label="Ballot Party">
                      {partyAbbreviationToString(voter.checkIn.ballotParty)}
                    </LabelledText>
                  )}
                </Column>
              </React.Fragment>
            )}
          </Card>
          {!voter.checkIn &&
            !voter.isInactive &&
            !voter.isInvalidatedRegistration &&
            !voter.registrationEvent && (
              <Button
                icon="Flag"
                color="danger"
                disabled={
                  !configuredPrecinctId ||
                  configuredPrecinctId !== getVoterPrecinct(voter)
                }
                onPress={() => setShowMarkInactiveFlow(true)}
              >
                Flag Voter as Inactive
              </Button>
            )}
          {!voter.checkIn &&
            !voter.isInvalidatedRegistration &&
            voter.registrationEvent && (
              <Button
                icon="Delete"
                color="danger"
                disabled={
                  !configuredPrecinctId ||
                  configuredPrecinctId !== getVoterPrecinct(voter)
                }
                onPress={() => setShowInvalidateRegistrationFlow(true)}
              >
                Mark Invalid
              </Button>
            )}
          {voter.checkIn && (
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
                color="danger"
                fill="outlined"
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
