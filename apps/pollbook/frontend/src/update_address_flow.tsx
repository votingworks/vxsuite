import { throwIllegalValue } from '@votingworks/basics';
import type { Voter, VoterAddressChangeRequest } from '@votingworks/types';
import {
  MainHeader,
  H1,
  FullScreenMessage,
  FullScreenIconWrapper,
  Icons,
  ButtonBar,
  Button,
  MainContent,
  Callout,
  H4,
} from '@votingworks/ui';
import { useState, useMemo } from 'react';
import { Election } from '@votingworks/types';
import { Column, Row } from './layout';
import { NoNavScreen } from './nav_screen';
import { TitledCard, VoterName } from './shared_components';
import { AddressInputGroup } from './address_input_group';
import { changeVoterAddress, getPollbookConfigurationInformation } from './api';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals';

type UpdateAddressFlowState =
  | { step: 'update' }
  | { step: 'printing' }
  | { step: 'success' };

function createBlankAddress(): VoterAddressChangeRequest {
  return {
    streetNumber: '',
    streetName: '',
    streetSuffix: '',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: '',
    state: 'NH',
    zipCode: '',
    precinct: '',
  };
}

function UpdateAddressScreen({
  voter,
  onConfirm,
  onCancel,
  election,
}: {
  voter: Voter;
  onConfirm: (address: VoterAddressChangeRequest) => void;
  onCancel: () => void;
  election: Election;
}): JSX.Element {
  const configurationQuery = getPollbookConfigurationInformation.useQuery();
  const [address, setAddress] = useState<VoterAddressChangeRequest>(
    createBlankAddress()
  );
  const isAddressValid = !(address.city === '' || address.zipCode === '');

  const isAddressInWrongPrecinct = useMemo(
    () =>
      isAddressValid &&
      configurationQuery.data !== undefined &&
      configurationQuery.data.configuredPrecinctId !== undefined &&
      address.precinct !== configurationQuery.data.configuredPrecinctId,
    [isAddressValid, address.precinct, configurationQuery.data]
  );

  const configuredPrecinct = useMemo(
    () =>
      configurationQuery.data &&
      election.precincts.find(
        (p) => p.id === configurationQuery.data.configuredPrecinctId
      ),
    [election.precincts, configurationQuery.data]
  );
  const enteredPrecinct = useMemo(
    () =>
      address.precinct &&
      election.precincts.find((p) => p.id === address.precinct),
    [election.precincts, address.precinct]
  );

  const isSubmitDisabled = useMemo(
    () =>
      voter.firstName.trim() === '' ||
      voter.lastName.trim() === '' ||
      voter.streetName.trim() === '' ||
      voter.party.trim() === '' ||
      !isAddressValid ||
      isAddressInWrongPrecinct,
    [voter, isAddressValid, isAddressInWrongPrecinct]
  );

  return (
    <NoNavScreen>
      <MainHeader>
        <H1>Update Voter Domicile Address</H1>
      </MainHeader>
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          <TitledCard
            title={
              <H4>
                <VoterName voter={voter} />
              </H4>
            }
          >
            <Column style={{ gap: '1rem' }}>
              <AddressInputGroup address={address} onChange={setAddress} />
            </Column>
          </TitledCard>
          {address.streetNumber.trim() !== '' &&
            address.streetName !== '' &&
            !isAddressValid && (
              <Callout icon="Danger" color="danger">
                <span>
                  Invalid address for <strong>{election.county.name}</strong>.
                  Make sure the street number and name match a valid address.
                </span>
              </Callout>
            )}
          {isAddressInWrongPrecinct && (
            <Callout icon="Danger" color="danger">
              <span>
                This address is associated with a different precinct,{' '}
                <strong>{enteredPrecinct && enteredPrecinct.name}</strong>.
                Voters can only have their address changed to an address within
                the current precinct,{' '}
                <strong>{configuredPrecinct && configuredPrecinct.name}</strong>
                .
              </span>
            </Callout>
          )}
        </Column>
      </MainContent>
      <ButtonBar>
        <Button
          rightIcon="Next"
          variant="primary"
          disabled={isSubmitDisabled}
          onPress={() => onConfirm(address)}
          style={{ flex: 1 }}
        >
          Confirm Domicile Address Update
        </Button>
        <Button onPress={onCancel} style={{ flex: 1 }}>
          Cancel
        </Button>
      </ButtonBar>
    </NoNavScreen>
  );
}

interface UpdateAddressFlowProps {
  voter: Voter;
  returnToPreviousScreen: () => void;
  returnToPreviousScreenLabelText: string;
  election: Election;
}

export function UpdateAddressFlow({
  voter,
  returnToPreviousScreen,
  returnToPreviousScreenLabelText,
  election,
}: UpdateAddressFlowProps): JSX.Element {
  const [flowState, setFlowState] = useState<UpdateAddressFlowState>({
    step: 'update',
  });
  const [timeoutIdForReset, setTimeoutIdForReset] =
    useState<ReturnType<typeof setTimeout>>();
  const changeVoterAddressMutation = changeVoterAddress.useMutation();

  switch (flowState.step) {
    case 'update':
      return (
        <UpdateAddressScreen
          voter={voter}
          election={election}
          onConfirm={(addressChangeData) => {
            setFlowState({ step: 'printing' });
            changeVoterAddressMutation.mutate(
              {
                voterId: voter.voterId,
                addressChangeData,
              },
              {
                onSuccess: () => {
                  setTimeoutIdForReset(
                    setTimeout(
                      returnToPreviousScreen,
                      AUTOMATIC_FLOW_STATE_RESET_DELAY_MS
                    )
                  );
                  setFlowState({ step: 'success' });
                },
              }
            );
          }}
          onCancel={returnToPreviousScreen}
        />
      );

    case 'printing':
      return (
        <NoNavScreen>
          <MainHeader>
            <H1>Update Voter Domicile Address</H1>
          </MainHeader>
          <Column style={{ justifyContent: 'center', flex: 1 }}>
            <FullScreenMessage
              title="Printing voter receipt…"
              image={
                <FullScreenIconWrapper>
                  <Icons.Loading />
                </FullScreenIconWrapper>
              }
            />
          </Column>
        </NoNavScreen>
      );

    case 'success':
      return (
        <NoNavScreen>
          <MainHeader>
            <Row style={{ justifyContent: 'space-between' }}>
              <H1>Voter Domicile Address Updated</H1>
            </Row>
          </MainHeader>
          <Column style={{ justifyContent: 'center', flex: 1 }}>
            <FullScreenMessage
              title={null}
              image={
                <FullScreenIconWrapper>
                  <Icons.Done color="primary" />
                </FullScreenIconWrapper>
              }
            >
              <H1>
                Domicile address updated for <VoterName voter={voter} />
              </H1>
              <p>Give the voter their receipt.</p>
            </FullScreenMessage>
          </Column>
          <Row style={{ padding: '1rem', justifyContent: 'flex-end' }}>
            <Button
              icon="Next"
              variant="primary"
              onPress={() => {
                clearTimeout(timeoutIdForReset);
                returnToPreviousScreen();
              }}
            >
              {returnToPreviousScreenLabelText}
            </Button>
          </Row>
        </NoNavScreen>
      );

    default: {
      throwIllegalValue(flowState);
    }
  }
}
