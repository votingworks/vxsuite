import { useState } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import { z } from 'zod';
import { ElectionId, ElectionIdSchema, unsafeParse } from '@votingworks/types';
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

export const StyledForm = styled(Form)`
  width: 25rem;

  input {
    width: 100%;
  }
`;

export const Annotation = styled.div`
  line-height: 1.25rem;
  margin-top: -1rem;
`;

function BallotOrderInfoForm({
  electionId,
  savedBallotOrderInfo,
}: {
  electionId: ElectionId;
  savedBallotOrderInfo: BallotOrderInfo;
}): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [ballotOrderInfo, setBallotOrderInfo] =
    useState<BallotOrderInfo>(savedBallotOrderInfo);
  const updateBallotOrderInfoMutation = updateBallotOrderInfo.useMutation();

  function onSubmit() {
    updateBallotOrderInfoMutation.mutate(
      {
        electionId,
        ballotOrderInfo: { ...savedBallotOrderInfo, ...ballotOrderInfo },
      },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  function onReset() {
    if (isEditing) {
      setBallotOrderInfo(savedBallotOrderInfo);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  }

  return (
    <StyledForm
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onReset={(e) => {
        e.preventDefault();
        onReset();
      }}
    >
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
      <InputGroup label="Paper Color for Ballots">
        <input
          type="text"
          value={ballotOrderInfo.ballotColor ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              ballotColor: e.target.value,
            })
          }
          disabled={!isEditing}
        />
      </InputGroup>
      <Annotation>
        <Icons.Info /> Specify if for town or school ballots. If not specified,
        we’ll print on white.
      </Annotation>
      <CheckboxButton
        label="Print Collated"
        isChecked={Boolean(ballotOrderInfo.shouldPrintCollated)}
        onChange={(isChecked) =>
          setBallotOrderInfo({
            ...ballotOrderInfo,
            shouldPrintCollated: isChecked,
          })
        }
        disabled={!isEditing}
      />
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
      <InputGroup label="Delivery Recipient Phone Number">
        <input
          type="text"
          value={ballotOrderInfo.deliveryRecipientPhoneNumber ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              deliveryRecipientPhoneNumber: e.target.value,
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
          <Button type="reset">Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            icon="Done"
            disabled={updateBallotOrderInfoMutation.isLoading}
          >
            Save
          </Button>
        </FormActionsRow>
      ) : (
        <FormActionsRow>
          <Button type="reset" variant="primary" icon="Edit">
            Edit
          </Button>
        </FormActionsRow>
      )}
    </StyledForm>
  );
}

export function BallotOrderInfoScreen(): JSX.Element | null {
  const params = useParams<{ electionId: string }>();
  const { electionId } = unsafeParse(
    z.object({ electionId: ElectionIdSchema }),
    params
  );
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
