import { assert, find, Result, throwIllegalValue } from '@votingworks/basics';
import { Id } from '@votingworks/types';
import {
  H1,
  Icons,
  MainContent,
  MainHeader,
  FileInputButton,
  Table,
} from '@votingworks/ui';
import { FormEvent } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import type { ElectionRecord } from '@votingworks/design-backend';
import {
  listElections,
  createElection,
  loadElection,
  getUser,
  getAllOrgs,
} from './api';
import { Column, Row } from './layout';
import { NavScreen } from './nav_screen';
import { CreateElectionButton } from './create_election_button';
import { useUserFeatures, UserFeaturesProvider } from './features_context';

const ButtonRow = styled.tr`
  cursor: pointer;

  & td {
    padding: 0.75rem 0.5rem;
  }

  &:hover {
    background-color: ${(p) => p.theme.colors.containerLow};
  }
`;

enum ElectionStatus {
  NotStarted = 1,
  InProgress,
  BallotsFinalized,
  OrderSubmitted,
}

function electionStatus(electionRecord: ElectionRecord): ElectionStatus {
  if (electionRecord.election.contests.length === 0) {
    return ElectionStatus.NotStarted;
  }
  if (!electionRecord.ballotsFinalizedAt) {
    return ElectionStatus.InProgress;
  }
  if (Object.values(electionRecord.ballotOrderInfo).length === 0) {
    return ElectionStatus.BallotsFinalized;
  }
  return ElectionStatus.OrderSubmitted;
}

function AllOrgsElectionsList({
  elections,
}: {
  elections: ElectionRecord[];
}): JSX.Element | null {
  const getAllOrgsQuery = getAllOrgs.useQuery();
  const history = useHistory();

  if (!getAllOrgsQuery.isSuccess) {
    return null;
  }
  const orgs = getAllOrgsQuery.data;

  return (
    <Table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Org</th>
          <th>Title</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {elections.map((electionRecord) => {
          const { election, orgId } = electionRecord;
          return (
            <ButtonRow
              key={election.id}
              onClick={() => history.push(`/elections/${election.id}`)}
            >
              <td>
                {(() => {
                  const status = electionStatus(electionRecord);
                  switch (status) {
                    case ElectionStatus.NotStarted:
                      return (
                        <span>
                          <Icons.Closed color="danger" /> Not started
                        </span>
                      );
                    case ElectionStatus.InProgress:
                      return (
                        <span>
                          <Icons.Circle color="warning" /> In progress
                        </span>
                      );
                    case ElectionStatus.BallotsFinalized:
                      return (
                        <span>
                          <Icons.CircleDot color="primary" /> Ballots finalized
                        </span>
                      );
                    case ElectionStatus.OrderSubmitted:
                      return (
                        <span>
                          <Icons.Done color="success" /> Order submitted
                        </span>
                      );
                    default: {
                      /* istanbul ignore next - @preserve */
                      throwIllegalValue(status);
                    }
                  }
                })()}
              </td>
              <td>{find(orgs, (org) => org.id === orgId).displayName}</td>
              <td>{election.title || 'Untitled Election'}</td>
              <td>
                {election.date &&
                  format.localeDate(
                    election.date.toMidnightDatetimeWithSystemTimezone()
                  )}
              </td>
            </ButtonRow>
          );
        })}
      </tbody>
    </Table>
  );
}

function SingleOrgElectionsList({
  elections,
}: {
  elections: ElectionRecord[];
}): JSX.Element | null {
  const history = useHistory();
  return (
    <Table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Date</th>
          <th>Jurisdiction</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        {elections.map(({ election }) => (
          <ButtonRow
            key={election.id}
            onClick={() => history.push(`/elections/${election.id}`)}
          >
            <td>{election.title || 'Untitled Election'}</td>
            <td>
              {election.date &&
                format.localeDate(
                  election.date.toMidnightDatetimeWithSystemTimezone()
                )}
            </td>
            <td>{election.county.name}</td>
            <td>{election.state}</td>
          </ButtonRow>
        ))}
      </tbody>
    </Table>
  );
}

function ElectionsScreenContents(): JSX.Element | null {
  const listElectionsQuery = listElections.useQuery();
  const createElectionMutation = createElection.useMutation();
  const loadElectionMutation = loadElection.useMutation();

  const user = getUser.useQuery().data;

  const history = useHistory();
  const features = useUserFeatures();

  function onCreateElectionSuccess(result: Result<Id, Error>) {
    if (result.isOk()) {
      const electionId = result.ok();
      history.push(`/elections/${electionId}`);
      return;
    }
    // TODO handle error case
    throw result.err();
  }

  async function onSelectElectionFile(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    const file = files[0];
    const electionData = await file.text();
    assert(!!user);
    loadElectionMutation.mutate(
      // [TODO] Assuming this flow will be unused for March elections. If
      // it ends up being needed, we'll need an org selection flow here as well.
      { electionData, orgId: user.orgId },
      { onSuccess: onCreateElectionSuccess }
    );
  }

  if (!listElectionsQuery.isSuccess) {
    return null;
  }
  const elections = listElectionsQuery.data;

  return (
    <NavScreen>
      <MainHeader>
        <H1>Elections</H1>
      </MainHeader>
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          {features.ACCESS_ALL_ORGS ? (
            <AllOrgsElectionsList elections={elections} />
          ) : (
            <SingleOrgElectionsList elections={elections} />
          )}
          {features.CREATE_ELECTION && (
            <Row style={{ gap: '0.5rem' }}>
              <CreateElectionButton
                variant={elections.length === 0 ? 'primary' : undefined}
              />
              <FileInputButton
                accept=".json"
                onChange={onSelectElectionFile}
                disabled={createElectionMutation.isLoading}
              >
                Load Election
              </FileInputButton>
            </Row>
          )}
        </Column>
      </MainContent>
    </NavScreen>
  );
}

export function ElectionsScreen(): JSX.Element {
  return (
    <UserFeaturesProvider>
      <ElectionsScreenContents />
    </UserFeaturesProvider>
  );
}
