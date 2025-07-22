import {
  Button,
  ButtonBar,
  Callout,
  Caption,
  Card,
  CheckboxButton,
  H1,
  H2,
  LabelledText,
  MainContent,
  MainHeader,
  Modal,
  SearchSelect,
} from '@votingworks/ui';
import React, { useState } from 'react';
import type {
  PartyAbbreviation,
  VoterIdentificationMethod,
} from '@votingworks/pollbook-backend';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Election } from '@votingworks/types';
import { Column, Row } from './layout';
import { NoNavScreen } from './nav_screen';
import { usStates } from './us_states';
import {
  AbsenteeModeCallout,
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
import { getVoter } from './api';
import { getVoterPrecinct } from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { NH, ...usStatesWithoutNewHampshire } = usStates;

function isIdentificationMethodComplete(
  identificationMethod: Partial<VoterIdentificationMethod>
): identificationMethod is VoterIdentificationMethod {
  switch (identificationMethod.type) {
    case 'default':
      return true;
    case 'outOfStateLicense':
      return Boolean(identificationMethod.state);
    case undefined:
      return false;
    default:
      throwIllegalValue(identificationMethod);
  }
}

export function VoterConfirmScreen({
  voterId,
  isAbsenteeMode,
  onCancel,
  onConfirmVoterIdentity,
  onConfirmCheckIn,
  election,
  configuredPrecinctId,
}: {
  voterId: string;
  isAbsenteeMode: boolean;
  onCancel: () => void;
  onConfirmVoterIdentity: (
    voterId: string,
    identificationMethod: VoterIdentificationMethod
  ) => void;
  onConfirmCheckIn: (
    voterId: string,
    identificationMethod: VoterIdentificationMethod,
    ballotParty: PartyAbbreviation
  ) => void;
  election: Election;
  configuredPrecinctId: string;
}): JSX.Element | null {
  const getVoterQuery = getVoter.useQuery(voterId);
  const [showUpdateAddressFlow, setShowUpdateAddressFlow] = useState(false);
  const [showUpdateMailingAddressFlow, setShowUpdateMailingAddressFlow] =
    useState(false);
  const [showInactiveVoterModal, setShowInactiveVoterModal] = useState(false);
  const [identificationMethod, setIdentificationMethod] = useState<
    Partial<VoterIdentificationMethod>
  >({ type: 'default' });

  if (!getVoterQuery.isSuccess) {
    return null;
  }

  const voter = getVoterQuery.data;
  const isVoterInWrongPrecinct =
    configuredPrecinctId !== getVoterPrecinct(voter);

  function closeInactiveVoterModal() {
    setShowInactiveVoterModal(false);
  }

  if (showUpdateAddressFlow) {
    return (
      <UpdateAddressFlow
        voter={voter}
        returnToPreviousScreen={() => setShowUpdateAddressFlow(false)}
        returnToPreviousScreenLabelText="Return to Check-In"
      />
    );
  }

  if (showUpdateMailingAddressFlow) {
    return (
      <UpdateMailingAddressFlow
        voter={voter}
        returnToPreviousScreen={() => setShowUpdateMailingAddressFlow(false)}
        returnToPreviousScreenLabelText="Return to Check-In"
      />
    );
  }

  const partySelectionRequired =
    election.type === 'primary' && voter.party === 'UND';

  return (
    <NoNavScreen>
      <MainHeader>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Confirm Voter Identity</H1>
          {isAbsenteeMode && <AbsenteeModeCallout />}
        </Row>
      </MainHeader>
      <MainContent style={{ display: 'flex', flexDirection: 'row' }}>
        <Column style={{ gap: '0.5rem', flex: 1 }}>
          {voter.isInactive && (
            <Callout icon="Flag" color="danger">
              <strong>
                This voter was flagged as inactive. Notify an election manager
                if anyone attempts to check in with this identity.
              </strong>
            </Callout>
          )}
          {isVoterInWrongPrecinct && (
            <Callout icon="Flag" color="danger">
              <strong>
                The voter cannot be checked in because their address is in
                another precinct.
              </strong>
            </Callout>
          )}
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
            <Row style={{ justifyContent: 'space-between' }}>
              <Column style={{ width: '600px', gap: '1rem' }}>
                <Row style={{ gap: '1.5rem' }}>
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
                </Row>
                <Row style={{ gap: '1.5rem' }}>
                  <LabelledText
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
                    <LabelledText label="Updated Domicile Address">
                      <AddressChange address={voter.addressChange} />
                    </LabelledText>
                  )}
                </Row>
                {hasMailingAddress(voter) && (
                  <LabelledText
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
                  <LabelledText label="Updated Mailing Address">
                    <MailingAddressChange
                      address={voter.mailingAddressChange}
                    />
                  </LabelledText>
                )}

                <LabelledText label="Voter ID">{voter.voterId}</LabelledText>
              </Column>
            </Row>
          </Card>
          <Row style={{ justifyContent: 'space-between' }}>
            {isAbsenteeMode ? (
              <div />
            ) : (
              <Row style={{ gap: '0.5rem' }}>
                <CheckboxButton
                  label="Out-of-State ID"
                  disabled={isVoterInWrongPrecinct}
                  onChange={(checked) => {
                    setIdentificationMethod(
                      checked
                        ? { type: 'outOfStateLicense' }
                        : { type: 'default' }
                    );
                  }}
                  isChecked={identificationMethod.type === 'outOfStateLicense'}
                />

                {identificationMethod.type === 'outOfStateLicense' && (
                  <SearchSelect
                    id="state"
                    options={Object.entries(usStatesWithoutNewHampshire).map(
                      ([value, label]) => ({
                        value,
                        label: `${value} - ${label}`,
                      })
                    )}
                    menuPortalTarget={document.body}
                    value={
                      identificationMethod.type === 'outOfStateLicense'
                        ? identificationMethod.state
                        : undefined
                    }
                    onChange={(state) =>
                      setIdentificationMethod({
                        type: 'outOfStateLicense',
                        state,
                      })
                    }
                    style={{ width: '14rem' }}
                    placeholder="Select state..."
                    aria-label="Select state"
                  />
                )}
              </Row>
            )}
            <Row style={{ gap: '0.5rem' }}>
              <Button
                icon="Edit"
                disabled={isVoterInWrongPrecinct}
                onPress={() => setShowUpdateAddressFlow(true)}
              >
                Update Domicile Address
              </Button>
              <Button
                icon="Edit"
                disabled={isVoterInWrongPrecinct}
                onPress={() => setShowUpdateMailingAddressFlow(true)}
              >
                Update Mailing Address
              </Button>
            </Row>
          </Row>
        </Column>
      </MainContent>
      <ButtonBar>
        <Button
          rightIcon="Next"
          variant={voter.isInactive ? 'danger' : 'primary'}
          disabled={
            isVoterInWrongPrecinct ||
            !isIdentificationMethodComplete(identificationMethod)
          }
          onPress={() => {
            assert(isIdentificationMethodComplete(identificationMethod));
            if (voter.isInactive) {
              setShowInactiveVoterModal(true);
            } else if (partySelectionRequired) {
              onConfirmVoterIdentity(voterId, identificationMethod);
            } else {
              onConfirmCheckIn(
                voterId,
                identificationMethod,
                // No party selection required for voters with declared party
                voter.party
              );
            }
          }}
          style={{ flex: 1 }}
        >
          Confirm {partySelectionRequired ? 'Identity' : 'Check-In'}
        </Button>
        <Button onPress={onCancel} style={{ flex: 1 }}>
          Cancel
        </Button>
      </ButtonBar>
      {showInactiveVoterModal && (
        <Modal
          title="Confirm Check-In"
          content="This voter was flagged as inactive. Continue only if you have confirmed with an election manager that the voter was flagged as inactive in error."
          actions={
            <React.Fragment>
              <Button
                rightIcon="Next"
                variant="danger"
                onPress={() => {
                  assert(isIdentificationMethodComplete(identificationMethod));
                  if (partySelectionRequired) {
                    onConfirmVoterIdentity(voterId, identificationMethod);
                  } else {
                    onConfirmCheckIn(
                      voterId,
                      identificationMethod,
                      // No party selection required for voters with declared party
                      voter.party
                    );
                  }
                }}
              >
                Confirm {partySelectionRequired ? 'Identity' : 'Check-In'}
              </Button>
              <Button onPress={closeInactiveVoterModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeInactiveVoterModal}
        />
      )}
    </NoNavScreen>
  );
}
