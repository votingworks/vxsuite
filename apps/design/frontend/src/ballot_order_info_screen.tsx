import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import { z } from 'zod';

import { ElectionId, ElectionIdSchema, unsafeParse } from '@votingworks/types';
import {
  Button,
  Card,
  CheckboxButton,
  H1,
  H3,
  Icons,
  MainContent,
  MainHeader,
  Modal,
  P,
} from '@votingworks/ui';
import type { BallotOrderInfo } from '@votingworks/design-backend';
import {
  getBallotsFinalizedAt,
  getElection,
  updateBallotOrderInfo,
} from './api';
import { Form, FormActionsRow, InputGroup, Row } from './layout';
import { ElectionNavScreen } from './nav_screen';
import { routes } from './routes';
import { useTitle } from './hooks/use_title';

export const StyledForm = styled(Form)`
  width: 30rem;

  input {
    width: 100%;
  }
`;

const SubmitOrderCallout = styled(Card).attrs({ color: 'neutral' })`
  h3 {
    line-height: 0.8;
    margin: 0 !important;
  }
`;

const Annotation = styled.div`
  line-height: 1.25rem;
  margin-top: -1rem;
`;

function BallotOrderInfoForm({
  electionId,
  savedBallotOrderInfo,
  ballotsFinalizedAt,
}: {
  electionId: ElectionId;
  savedBallotOrderInfo: BallotOrderInfo;
  ballotsFinalizedAt: Date | null;
}): JSX.Element {
  const [ballotOrderInfo, setBallotOrderInfo] =
    useState<BallotOrderInfo>(savedBallotOrderInfo);
  const [isConfirmingSubmit, setIsConfirmingSubmit] = useState(false);
  const updateBallotOrderInfoMutation = updateBallotOrderInfo.useMutation();

  const isFormEditable =
    ballotsFinalizedAt && !savedBallotOrderInfo.orderSubmittedAt;

  function onSubmit() {
    updateBallotOrderInfoMutation.mutate(
      {
        electionId,
        ballotOrderInfo: {
          ...savedBallotOrderInfo,
          ...ballotOrderInfo,
          orderSubmittedAt: new Date().toISOString(),
        },
      },
      { onSuccess: () => setIsConfirmingSubmit(false) }
    );
  }

  function onReset() {
    setBallotOrderInfo(savedBallotOrderInfo);
  }

  return (
    <StyledForm
      onSubmit={(e) => {
        e.preventDefault();
        setIsConfirmingSubmit(true);
      }}
      onReset={(e) => {
        e.preventDefault();
        onReset();
      }}
    >
      {(savedBallotOrderInfo.orderSubmittedAt || !ballotsFinalizedAt) && (
        <SubmitOrderCallout>
          <Row style={{ gap: '0.5rem' }}>
            {savedBallotOrderInfo.orderSubmittedAt ? (
              <React.Fragment>
                <Icons.Done color="primary" /> <H3>Order Submitted</H3>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <Icons.Info />
                <div>
                  <H3>Ballots are Not Finalized</H3>
                  <div style={{ marginTop: '0.5rem' }}>
                    Ballots must be finalized before an order can be submitted.
                  </div>
                </div>
              </React.Fragment>
            )}
          </Row>
        </SubmitOrderCallout>
      )}
      <InputGroup label="Number of Absentee Ballots">
        <input
          type="number"
          min={0}
          step={1}
          value={ballotOrderInfo.absenteeBallotCount ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              absenteeBallotCount: e.target.value,
            })
          }
          onBlur={(e) => {
            setBallotOrderInfo({
              ...ballotOrderInfo,
              absenteeBallotCount: e.target.value.trim(),
            });
          }}
          disabled={!isFormEditable}
          required
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
        disabled={!isFormEditable}
      />
      <InputGroup label="Number of Polling Place Ballots">
        <input
          type="number"
          min={0}
          step={1}
          value={ballotOrderInfo.precinctBallotCount ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              precinctBallotCount: e.target.value,
            })
          }
          onBlur={(e) => {
            setBallotOrderInfo({
              ...ballotOrderInfo,
              precinctBallotCount: e.target.value.trim(),
            });
          }}
          disabled={!isFormEditable}
          required
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
          onBlur={(e) => {
            setBallotOrderInfo({
              ...ballotOrderInfo,
              ballotColor: e.target.value.trim(),
            });
          }}
          disabled={!isFormEditable}
        />
      </InputGroup>
      <Annotation>
        <Icons.Info /> Specify if for town or school ballots. If not specified,
        we’ll print on white.
      </Annotation>
      <CheckboxButton
        label="Collate Ballot Pages"
        isChecked={Boolean(ballotOrderInfo.shouldCollateBallotPages)}
        onChange={(isChecked) =>
          setBallotOrderInfo({
            ...ballotOrderInfo,
            shouldCollateBallotPages: isChecked,
          })
        }
        disabled={!isFormEditable}
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
          onBlur={(e) => {
            setBallotOrderInfo({
              ...ballotOrderInfo,
              deliveryRecipientName: e.target.value.trim(),
            });
          }}
          disabled={!isFormEditable}
          required
        />
      </InputGroup>
      <InputGroup label="Delivery Recipient Phone Number">
        <input
          type="tel"
          value={ballotOrderInfo.deliveryRecipientPhoneNumber ?? ''}
          onChange={(e) =>
            setBallotOrderInfo({
              ...ballotOrderInfo,
              deliveryRecipientPhoneNumber: e.target.value,
            })
          }
          onBlur={(e) => {
            setBallotOrderInfo({
              ...ballotOrderInfo,
              deliveryRecipientPhoneNumber: e.target.value.trim(),
            });
          }}
          disabled={!isFormEditable}
          required
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
          onBlur={(e) => {
            setBallotOrderInfo({
              ...ballotOrderInfo,
              deliveryAddress: e.target.value.trim(),
            });
          }}
          disabled={!isFormEditable}
          required
        />
      </InputGroup>
      <FormActionsRow>
        <Button
          disabled={!isFormEditable}
          icon="Done"
          type="submit"
          variant="primary"
        >
          Submit Order
        </Button>
        {isConfirmingSubmit && (
          <Modal
            title="Confirm Submit Order"
            content={
              <P>
                Once your order is submitted, your order info may not be edited
                further.
              </P>
            }
            actions={
              <React.Fragment>
                <Button
                  onPress={() => onSubmit()}
                  variant="primary"
                  icon="Done"
                >
                  Submit Order
                </Button>
                <Button onPress={() => setIsConfirmingSubmit(false)}>
                  Cancel
                </Button>
              </React.Fragment>
            }
            onOverlayClick={() => setIsConfirmingSubmit(false)}
          />
        )}
      </FormActionsRow>
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
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  useTitle(
    routes.election(electionId).ballotOrderInfo.title,
    getElectionQuery.data?.election.title
  );

  if (!getElectionQuery.isSuccess || !getBallotsFinalizedAtQuery.isSuccess) {
    return null;
  }

  const { ballotOrderInfo } = getElectionQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;

  return (
    <ElectionNavScreen electionId={electionId}>
      <MainHeader>
        <H1>Order Ballots</H1>
      </MainHeader>
      <MainContent>
        <BallotOrderInfoForm
          electionId={electionId}
          savedBallotOrderInfo={ballotOrderInfo}
          ballotsFinalizedAt={ballotsFinalizedAt}
        />
      </MainContent>
    </ElectionNavScreen>
  );
}
