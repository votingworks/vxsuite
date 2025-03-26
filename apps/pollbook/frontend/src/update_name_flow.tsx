import type {
  VoterNameChangeRequest,
  Voter,
} from '@votingworks/pollbook-backend';
import {
  MainHeader,
  H1,
  MainContent,
  ButtonBar,
  H4,
  Button,
  FullScreenMessage,
  FullScreenIconWrapper,
  Icons,
} from '@votingworks/ui';
import { useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import { NoNavScreen } from './nav_screen';
import { TitledCard, VoterName } from './shared_components';
import { Column, Row } from './layout';
import { changeVoterName } from './api';
import { NameInputGroup } from './name_input_group';

type UpdateNameFlowState =
  | { step: 'update' }
  | { step: 'printing' }
  | { step: 'success'; voter: Voter };

function createBlankName(): VoterNameChangeRequest {
  return {
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
  };
}

function UpdateNameScreen({
  voter,
  onConfirm,
  onCancel,
}: {
  voter: Voter;
  onConfirm: (nameChangeData: VoterNameChangeRequest) => void;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState<VoterNameChangeRequest>(createBlankName());

  const isNameValid = !(
    name.firstName.trim() === '' || name.lastName.trim() === ''
  );

  return (
    <NoNavScreen>
      <MainHeader>
        <H1>Update Voter Name</H1>
      </MainHeader>
      <MainContent>
        <TitledCard
          title={
            <H4>
              <VoterName voter={voter} lastNameFirst />
            </H4>
          }
        >
          <Column style={{ gap: '1rem' }}>
            <NameInputGroup name={name} onChange={setName} />
          </Column>
        </TitledCard>
      </MainContent>
      <ButtonBar>
        <Button
          rightIcon="Next"
          variant="primary"
          disabled={!isNameValid}
          onPress={() => onConfirm(name)}
        >
          Confirm Name Update
        </Button>
        <Button onPress={onCancel}>Cancel</Button>
      </ButtonBar>
    </NoNavScreen>
  );
}

interface UpdateNameFlowProps {
  voter: Voter;
  returnToCheckIn: () => void;
  exitToSearch: () => void;
}

export function UpdateNameFlow({
  voter,
  returnToCheckIn,
  exitToSearch,
}: UpdateNameFlowProps): JSX.Element {
  const [flowState, setFlowState] = useState<UpdateNameFlowState>({
    step: 'update',
  });
  const changeVoterNameMutation = changeVoterName.useMutation();

  switch (flowState.step) {
    case 'update':
      return (
        <UpdateNameScreen
          voter={voter}
          onConfirm={(nameChangeData) => {
            setFlowState({ step: 'printing' });
            changeVoterNameMutation.mutate(
              {
                voterId: voter.voterId,
                nameChangeData,
              },
              {
                onSuccess: (updatedVoter) =>
                  setFlowState({ step: 'success', voter: updatedVoter }),
              }
            );
          }}
          onCancel={exitToSearch}
        />
      );

    case 'printing':
      return (
        <NoNavScreen>
          <MainHeader>
            <H1>Update Voter Name</H1>
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
              <H1>Voter Name Updated</H1>
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
                Name updated to <VoterName voter={flowState.voter} />
              </H1>
              <p>Give the voter their receipt.</p>
            </FullScreenMessage>
          </Column>
          <ButtonBar>
            <Button
              style={{ flex: 1 }}
              icon="Next"
              variant="primary"
              onPress={returnToCheckIn}
            >
              Continue Check-In
            </Button>
            <Button style={{ flex: 1 }} icon="X" onPress={exitToSearch}>
              Close
            </Button>
          </ButtonBar>
        </NoNavScreen>
      );

    default: {
      throwIllegalValue(flowState);
    }
  }
}
