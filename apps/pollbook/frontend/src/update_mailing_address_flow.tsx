import { throwIllegalValue } from '@votingworks/basics';
import type { Voter } from '@votingworks/types';
import {
  MainHeader,
  H1,
  FullScreenMessage,
  FullScreenIconWrapper,
  Icons,
  ButtonBar,
  Button,
  MainContent,
  H4,
} from '@votingworks/ui';
import { useState } from 'react';
import { Column, Row } from './layout';
import { NoNavScreen } from './nav_screen';
import { TitledCard, VoterName } from './shared_components';
import { MailingAddressInputGroup } from './mailing_address_input_group';
import { changeVoterMailingAddress } from './api';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals';

type UpdateMailingAddressFlowState =
  | { step: 'update' }
  | { step: 'printing' }
  | { step: 'success' };

export interface VoterMailingAddressChangeRequest {
  mailingStreetNumber: string;
  mailingStreetName: string;
  mailingSuffix: string;
  mailingApartmentUnitNumber: string;
  mailingHouseFractionNumber: string;
  mailingAddressLine2: string;
  mailingAddressLine3: string;
  mailingCityTown: string;
  mailingState: string;
  mailingZip5: string;
  mailingZip4: string;
}

function createBlankMailingAddress(): VoterMailingAddressChangeRequest {
  return {
    mailingStreetNumber: '',
    mailingStreetName: '',
    mailingSuffix: '',
    mailingApartmentUnitNumber: '',
    mailingHouseFractionNumber: '',
    mailingAddressLine2: '',
    mailingAddressLine3: '',
    mailingCityTown: '',
    mailingState: '',
    mailingZip5: '',
    mailingZip4: '',
  };
}

function UpdateMailingAddressScreen({
  voter,
  onConfirm,
  onCancel,
}: {
  voter: Voter;
  onConfirm: (address: VoterMailingAddressChangeRequest) => void;
  onCancel: () => void;
}): JSX.Element {
  const [mailingAddress, setMailingAddress] =
    useState<VoterMailingAddressChangeRequest>(createBlankMailingAddress());

  const isMailingAddressValid =
    mailingAddress.mailingCityTown !== '' &&
    mailingAddress.mailingState !== '' &&
    mailingAddress.mailingZip5.length === 5 &&
    (mailingAddress.mailingZip4.length === 0 ||
      mailingAddress.mailingZip4.length === 4);

  return (
    <NoNavScreen>
      <MainHeader>
        <H1>Update Voter Mailing Address</H1>
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
              <MailingAddressInputGroup
                mailingAddress={mailingAddress}
                onChange={setMailingAddress}
              />
            </Column>
          </TitledCard>
        </Column>
      </MainContent>
      <ButtonBar>
        <Button
          rightIcon="Next"
          variant="primary"
          disabled={!isMailingAddressValid}
          onPress={() => onConfirm(mailingAddress)}
          style={{ flex: 1 }}
        >
          Confirm Mailing Address Update
        </Button>
        <Button onPress={onCancel} style={{ flex: 1 }}>
          Cancel
        </Button>
      </ButtonBar>
    </NoNavScreen>
  );
}

interface UpdateMailingAddressFlowProps {
  voter: Voter;
  returnToPreviousScreen: () => void;
  returnToPreviousScreenLabelText: string;
}

export function UpdateMailingAddressFlow({
  voter,
  returnToPreviousScreen,
  returnToPreviousScreenLabelText,
}: UpdateMailingAddressFlowProps): JSX.Element {
  const [flowState, setFlowState] = useState<UpdateMailingAddressFlowState>({
    step: 'update',
  });
  const [timeoutIdForReset, setTimeoutIdForReset] =
    useState<ReturnType<typeof setTimeout>>();
  const changeVoterMailingAddressMutation =
    changeVoterMailingAddress.useMutation();

  switch (flowState.step) {
    case 'update':
      return (
        <UpdateMailingAddressScreen
          voter={voter}
          onConfirm={async (mailingAddressChangeData) => {
            setFlowState({ step: 'printing' });
            await changeVoterMailingAddressMutation.mutateAsync({
              voterId: voter.voterId,
              mailingAddressChangeData,
            });
            setTimeoutIdForReset(
              setTimeout(
                returnToPreviousScreen,
                AUTOMATIC_FLOW_STATE_RESET_DELAY_MS
              )
            );
            setFlowState({ step: 'success' });
          }}
          onCancel={returnToPreviousScreen}
        />
      );

    case 'printing':
      return (
        <NoNavScreen>
          <MainHeader>
            <H1>Update Voter Mailing Address</H1>
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
              <H1>Voter Mailing Address Updated</H1>
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
                Mailing address updated for <VoterName voter={voter} />
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
