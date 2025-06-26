import { throwIllegalValue } from '@votingworks/basics';
import type {
  Voter,
  VoterAddressChangeRequest,
} from '@votingworks/pollbook-backend';
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
}: {
  voter: Voter;
  onConfirm: (address: VoterAddressChangeRequest) => void;
  onCancel: () => void;
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
        <H1>Update Voter Address</H1>
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
                Invalid address. Make sure the street number and name match a
                valid address for this jurisdiction.
              </Callout>
            )}
          {isAddressInWrongPrecinct && (
            <Callout icon="Danger" color="danger">
              This address is not in the current precinct. Voters can only have
              their address changed to addresses within the configured precinct.
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
          Confirm Address Update
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
}

export function UpdateAddressFlow({
  voter,
  returnToPreviousScreen,
  returnToPreviousScreenLabelText,
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
            <H1>Update Voter Address</H1>
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
              <H1>Voter Address Updated</H1>
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
                Address updated for <VoterName voter={voter} />
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
