import { useState } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import { Id } from '@votingworks/types';
import {
  Button,
  CheckboxButton,
  H1,
  Icons,
  MainContent,
  MainHeader,
} from '@votingworks/ui';
import type { BallotOrderInfo } from '@votingworks/design-backend';

import { getElection, updateBallotOrderInfo } from './api';
import { Form, FormActionsRow, InputGroup } from './layout';
import { ElectionNavScreen } from './nav_screen';

export const Annotation = styled.div`
  margin-top: -1rem;
`;

function BallotOrderInfoForm({
  electionId,
  savedBallotOrderInfo,
}: {
  electionId: Id;
  savedBallotOrderInfo: BallotOrderInfo;
}): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [ballotOrderInfo, setBallotOrderInfo] =
    useState<BallotOrderInfo>(savedBallotOrderInfo);
  const updateBallotOrderInfoMutation = updateBallotOrderInfo.useMutation();

  function onSaveButtonPress() {
    updateBallotOrderInfoMutation.mutate(
      {
        electionId,
        ballotOrderInfo: { ...savedBallotOrderInfo, ...ballotOrderInfo },
      },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  return (
    <Form>
      <InputGroup label="Number of Absentee Ballots">
        <input
          type="text"
          value={ballotOrderInfo.absenteeBallotCount ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              absenteeBallotCount: e.target.value,
            })
          }
          disabled={!isEditing}
        />
      </InputGroup>
      <Annotation>
        <Icons.Info /> This count should include ballots needed for testing.
      </Annotation>
      <div>
        <CheckboxButton
          label="Score Absentee Ballots for Folding"
          isChecked={Boolean(
            ballotOrderInfo.shouldAbsenteeBallotsBeScoredForFolding
          )}
          onChange={(isChecked) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              shouldAbsenteeBallotsBeScoredForFolding: isChecked,
            })
          }
          disabled={!isEditing}
        />
      </div>
      <InputGroup label="Number of Polling Place Ballots">
        <input
          type="text"
          value={ballotOrderInfo.precinctBallotCount ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              precinctBallotCount: e.target.value,
            })
          }
          disabled={!isEditing}
        />
      </InputGroup>
      <Annotation>
        <Icons.Info /> This count should include ballots needed for testing.
      </Annotation>
      <InputGroup label="Paper Color for Polling Place Ballots">
        <input
          type="text"
          value={ballotOrderInfo.precinctBallotColor ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              precinctBallotColor: e.target.value,
            })
          }
          disabled={!isEditing}
        />
      </InputGroup>
      <Annotation>
        <Icons.Info /> Specify if for town or school ballots. If not specified,
        we’ll print on white.
      </Annotation>
      <InputGroup label="Delivery Recipient Name">
        <input
          type="text"
          value={ballotOrderInfo.deliveryRecipientName ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              deliveryRecipientName: e.target.value,
            })
          }
          disabled={!isEditing}
        />
      </InputGroup>
      <InputGroup label="Delivery Address, City, State, and ZIP">
        <input
          type="text"
          value={ballotOrderInfo.deliveryAddress ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              deliveryAddress: e.target.value,
            })
          }
          disabled={!isEditing}
        />
      </InputGroup>

      {isEditing ? (
        <FormActionsRow>
          <Button
            onPress={() => {
              setBallotOrderInfo(savedBallotOrderInfo);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="Done"
            onPress={onSaveButtonPress}
            disabled={updateBallotOrderInfoMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
      ) : (
        <FormActionsRow>
          <Button
            variant="primary"
            icon="Edit"
            onPress={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </FormActionsRow>
      )}
    </Form>
  );
}

export function BallotOrderInfoScreen(): JSX.Element | null {
  const { electionId } = useParams<{ electionId: string }>();
  const getElectionQuery = getElection.useQuery(electionId);

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  const { ballotOrderInfo } = getElectionQuery.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <MainHeader>
        <H1>Ballot Order Info</H1>
      </MainHeader>
      <MainContent>
        <BallotOrderInfoForm
          electionId={electionId}
          savedBallotOrderInfo={ballotOrderInfo}
        />
      </MainContent>
    </ElectionNavScreen>
  );
}
