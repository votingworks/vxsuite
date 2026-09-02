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
  CalloutProps,
  Font,
} from '@votingworks/ui';

import {
  hasPartialRegisteredVoterCounts,
  getPrecinctsWithoutAbsenteePollingPlace,
} from '@votingworks/types';
import * as api from './api.js';
import { ElectionIdParams, routes } from './routes.js';
import { Row } from './layout.js';

export function BallotsStatus(): React.ReactNode {
  const [isConfirmingFinalize, setIsConfirmingFinalize] = useState(false);

  const { electionId } = useParams<ElectionIdParams>();
  const listBallotStylesQuery = api.listBallotStyles.useQuery(electionId);
  const approvedAtQuery = api.getBallotsApprovedAt.useQuery(electionId);
  const finalizedAtQuery = api.getBallotsFinalizedAt.useQuery(electionId);
  const getStateFeaturesQuery = api.getStateFeatures.useQuery(electionId);
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);
  const listContestsQuery = api.listContests.useQuery(electionId);
  const listPrecinctsQuery = api.listPrecincts.useQuery(electionId);
  const getRegisteredVoterCountsQuery =
    api.getRegisteredVoterCounts.useQuery(electionId);
  const listPollingPlacesQuery = api.listPollingPlaces.useQuery(electionId);

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

  const ballotStyles = listBallotStylesQuery.data;
  const finalized = !!finalizedAtQuery.data;
  const approved = !!approvedAtQuery.data;
  const features = getStateFeaturesQuery.data;

  if (ballotStyles.length === 0) {
    return (
      <Callout color="neutral" icon={<Icons.Info />} title="Ballots Incomplete">
        VxDesign will create ballot styles for your election once you have
        created districts, precincts, and contests.
      </Callout>
    );
  }

  if (
    features.STRAIGHT_PARTY_VOTING &&
    getElectionInfoQuery.data.type === 'general' &&
    !listContestsQuery.data.some((contest) => contest.type === 'straight-party')
  ) {
    return (
      <Callout
        color="neutral"
        icon={<Icons.Info />}
        title="Cannot generate straight party contest"
      >
        To generate the straight party contest, the election must include a
        district that covers every precinct.
      </Callout>
    );
  }

  if (
    hasPartialRegisteredVoterCounts(
      listPrecinctsQuery.data,
      getRegisteredVoterCountsQuery.data
    )
  ) {
    return (
      <Callout
        color="neutral"
        icon={<Icons.Info />}
        title="Registered voter counts must be provided for all precincts and splits, or none."
      >
        Registered voter counts are set for some precincts but not all. Set
        counts for all precincts or remove them from all precincts before
        finalizing.
      </Callout>
    );
  }

  if (
    features.EDIT_POLLING_PLACES &&
    !features.OMIT_ABSENTEE_POLLING_PLACES &&
    getPrecinctsWithoutAbsenteePollingPlace(
      listPrecinctsQuery.data,
      listPollingPlacesQuery.data
    ).length > 0
  ) {
    return (
      <Callout
        color="neutral"
        icon={<Icons.Info />}
        title="Absentee polling places must cover every precinct."
      >
        Every precinct must be covered by an absentee polling place, so that
        centrally-scanned ballots have a location to be tabulated under. Add or
        edit absentee polling places to cover all precincts before finalizing.
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
