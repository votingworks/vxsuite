import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';

import {
  LinkButton,
  P,
  Button,
  H3,
  Icons,
  Modal,
  Callout as CalloutBase,
  type CalloutProps,
  Font,
} from '@votingworks/ui';

import { getFinalizeBlocker, Row } from '@votingworks/election-definition-ui';
import * as api from './api.js';
import { type ElectionIdParams, routes } from './routes.js';

export function BallotsStatus(): React.ReactNode {
  const [isConfirmingFinalize, setIsConfirmingFinalize] = useState(false);

  const { electionId } = useParams<ElectionIdParams>();
  const listBallotStylesQuery =
    api.electionDefinitionApi.listBallotStyles.useQuery(electionId);
  const approvedAtQuery = api.getBallotsApprovedAt.useQuery(electionId);
  const finalizedAtQuery = api.getBallotsFinalizedAt.useQuery(electionId);
  const getStateFeaturesQuery =
    api.electionDefinitionApi.getStateFeatures.useQuery(electionId);
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);
  const listContestsQuery =
    api.electionDefinitionApi.listContests.useQuery(electionId);
  const listPrecinctsQuery =
    api.electionDefinitionApi.listPrecincts.useQuery(electionId);
  const getRegisteredVoterCountsQuery =
    api.electionDefinitionApi.getRegisteredVoterCounts.useQuery(electionId);
  const listPollingPlacesQuery =
    api.electionDefinitionApi.listPollingPlaces.useQuery(electionId);

  const finalizeBallotsMutation = api.finalizeBallots.useMutation();

  if (
    !listBallotStylesQuery.isSuccess ||
    !finalizedAtQuery.isSuccess ||
    !approvedAtQuery.isSuccess ||
    !getStateFeaturesQuery.isSuccess ||
    !getElectionInfoQuery.isSuccess ||
    !listContestsQuery.isSuccess ||
    !listPrecinctsQuery.isSuccess ||
    !getRegisteredVoterCountsQuery.isSuccess ||
    !listPollingPlacesQuery.isSuccess
  ) {
    return null;
  }

  const finalized = !!finalizedAtQuery.data;
  const approved = !!approvedAtQuery.data;
  const features = getStateFeaturesQuery.data;

  const finalizeBlocker = getFinalizeBlocker({
    appName: 'VxHub',
    features,
    electionType: getElectionInfoQuery.data.type,
    ballotStyles: listBallotStylesQuery.data,
    contests: listContestsQuery.data,
    precincts: listPrecinctsQuery.data,
    registeredVoterCounts: getRegisteredVoterCountsQuery.data,
    pollingPlaces: listPollingPlacesQuery.data,
  });
  if (finalizeBlocker) {
    return (
      <Callout
        color="neutral"
        icon={<Icons.Info />}
        title={finalizeBlocker.title}
      >
        {finalizeBlocker.message}
      </Callout>
    );
  }

  if (approved) {
    return (
      <Callout
        action={
          <LinkButton
            rightIcon="Next"
            variant="primary"
            to={routes.election(electionId).downloads.path}
          >
            View Downloads
          </LinkButton>
        }
        color="primary"
        icon={<Icons.Done color="primary" />}
        title="Ready for Download"
      >
        Ballots are finalized and approved for download.
      </Callout>
    );
  }

  if (finalized) {
    return (
      <Callout
        color="neutral"
        icon={<Icons.Done color="primary" />}
        title="Ballots Finalized"
      >
        You will receive an email when the election package is ready for
        download.
      </Callout>
    );
  }

  return (
    <React.Fragment>
      <Callout
        action={
          <Button
            icon="Done"
            color="primary"
            fill="outlined"
            disabled={finalizeBallotsMutation.isLoading}
            onPress={() => setIsConfirmingFinalize(true)}
          >
            Finalize Ballots
          </Button>
        }
        color="neutral"
        icon={<Icons.Info />}
        title="Ballots Not Finalized"
      >
        Proof each ballot style, then finalize ballots.
      </Callout>

      {isConfirmingFinalize && (
        <Modal
          title="Finalize Ballots"
          content={
            <P>
              Once ballots are finalized, the election may not be edited
              further.
              {features.POST_FINALIZE_CHANGE_FEE_WARNING && (
                <React.Fragment>
                  {' '}
                  <strong>
                    Requesting a change after finalizing may incur a fee.
                  </strong>
                </React.Fragment>
              )}
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                icon="Done"
                onPress={() =>
                  finalizeBallotsMutation.mutate(
                    { electionId },
                    { onSuccess: () => setIsConfirmingFinalize(false) }
                  )
                }
                variant="primary"
              >
                Finalize Ballots
              </Button>
              <Button onPress={() => setIsConfirmingFinalize(false)}>
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={
            // @coverage-exclude: manually tested
            () => setIsConfirmingFinalize(false)
          }
        />
      )}
    </React.Fragment>
  );
}

const CalloutContent = styled.div`
  align-items: baseline;
  display: flex;
  flex-grow: 1;
  gap: 0.5rem;
`;

function Callout(
  props: CalloutProps & {
    action?: React.ReactNode;
    icon: React.ReactNode;
    title: React.ReactNode;
  }
) {
  const { action, children, icon, title, ...rest } = props;
  return (
    <CalloutBase style={{ maxWidth: '40rem', minWidth: '4rem' }} {...rest}>
      <CalloutContent>
        <H3 aria-hidden>{icon}</H3>
        <Row
          style={{
            alignItems: 'center',
            flexGrow: 1,
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ flexGrow: 1 }}>
            <H3>{title}</H3>
            <Font>{children}</Font>
          </div>

          {action}
        </Row>
      </CalloutContent>
    </CalloutBase>
  );
}
