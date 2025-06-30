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
import type { VoterIdentificationMethod } from '@votingworks/pollbook-backend';
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
} from './shared_components';
import { UpdateAddressFlow } from './update_address_flow';
import { getVoter } from './api';
import { getVoterPrecinct } from './types';

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
  onConfirm,
  election,
  configuredPrecinctId,
}: {
  voterId: string;
  isAbsenteeMode: boolean;
  onCancel: () => void;
  onConfirm: (identificationMethod: VoterIdentificationMethod) => void;
  election: Election;
  configuredPrecinctId: string;
}): JSX.Element | null {
  const getVoterQuery = getVoter.useQuery(voterId);
  const [showUpdateAddressFlow, setShowUpdateAddressFlow] = useState(false);
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

  return (
    <NoNavScreen>
      <MainHeader>
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>Confirm Voter Identity</H1>
          {isAbsenteeMode && <AbsenteeModeCallout />}
        </Row>
      </MainHeader>
      <MainContent style={{ display: 'flex', flexDirection: 'column' }}>
        <Column style={{ gap: '0.5rem', flex: 1 }}>
          {!isAbsenteeMode && !voter.isInactive && (
            <Callout icon="Danger" color="warning">
              Read the voter&apos;s information aloud to confirm their identity.
            </Callout>
          )}
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
                    options={Object.entries(usStates).map(([value, label]) => ({
                      value,
                      label: `${value} - ${label}`,
                    }))}
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
            <Button icon="Edit" onPress={() => setShowUpdateAddressFlow(true)}>
              Update Address
            </Button>
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
            } else {
              onConfirm(identificationMethod);
            }
          }}
          style={{ flex: 1 }}
        >
          Confirm Check-In
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
                  onConfirm(identificationMethod);
                }}
              >
                Confirm Check-In
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
