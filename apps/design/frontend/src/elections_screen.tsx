import { assert, find, Result, throwIllegalValue } from '@votingworks/basics';
import { Election, Id } from '@votingworks/types';
import {
  H1,
  Icons,
  MainContent,
  MainHeader,
  FileInputButton,
  Table,
  Button,
  StyledButtonProps,
} from '@votingworks/ui';
import { FormEvent, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
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
import { useTitle } from './hooks/use_title';
import { routes } from './routes';
import { CloneElectionButton } from './clone_election_button';

const ElectionRow = styled.tr`
  & td {
    padding: 0.75rem 0.5rem;
  }

  &:hover {
    background-color: ${(p) => p.theme.colors.containerLow};
  }
`;

const CloneButtonCell = styled.td`
  text-align: center;
`;

const LinkCellContainer = styled.td`
  cursor: pointer;
`;

function LinkCell(props: { election: Election } & React.PropsWithChildren) {
  const { children, election } = props;
  const history = useHistory();

  return (
    <LinkCellContainer
      onClick={() => history.push(`/elections/${election.id}`)}
    >
      {children}
    </LinkCellContainer>
  );
}

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

// eslint-disable-next-line vx/gts-no-return-type-only-generics
function useQueryParamsState<T extends Record<string, string> | undefined>(): [
  T,
  (newState: T) => void,
] {
  const { search } = useLocation();
  const history = useHistory();

  const searchState = useMemo(
    () =>
      (search
        ? Object.fromEntries(new URLSearchParams(search).entries())
        : undefined) as T,
    [search]
  );

  function setSearchState(newState: T) {
    const searchParams = new URLSearchParams();
    if (newState) {
      for (const [key, value] of Object.entries(newState)) {
        searchParams.set(key, value);
      }
    }
    history.push({ search: searchParams.toString() });
  }

  return [searchState, setSearchState];
}

type SortDirection = 'asc' | 'desc';

function SortHeaderButton(
  props: {
    direction?: SortDirection;
    onPress: (direction?: SortDirection) => void;
    children: React.ReactNode;
  } & Omit<StyledButtonProps, 'onPress'>
): JSX.Element {
  const { direction, onPress, ...rest } = props;
  return (
    <Button
      onPress={() => {
        switch (direction) {
          case 'asc':
            return onPress('desc');
          case 'desc':
            return onPress();
          case undefined:
            return onPress('asc');
          default: {
            /* istanbul ignore next - @preserve */
            throwIllegalValue(direction);
          }
        }
      }}
      fill="transparent"
      color={direction ? 'primary' : undefined}
      icon={
        direction === 'asc'
          ? 'SortUp'
          : direction === 'desc'
          ? 'SortDown'
          : 'Sort'
      }
      {...rest}
    />
  );
}

const STATUS_ELEMENTS: Readonly<Record<ElectionStatus, JSX.Element>> = {
  [ElectionStatus.NotStarted]: (
    <span>
      <Icons.Closed color="danger" /> Not started
    </span>
  ),
  [ElectionStatus.InProgress]: (
    <span>
      <Icons.Circle color="warning" /> In progress
    </span>
  ),
  [ElectionStatus.BallotsFinalized]: (
    <span>
      <Icons.CircleDot color="primary" /> Ballots finalized
    </span>
  ),
  [ElectionStatus.OrderSubmitted]: (
    <span>
      <Icons.Done color="success" /> Order submitted
    </span>
  ),
};

function AllOrgsElectionsList({
  elections,
}: {
  elections: ElectionRecord[];
}): JSX.Element | null {
  const getAllOrgsQuery = getAllOrgs.useQuery();
  const [sortState, setSortState] = useQueryParamsState<
    | {
        field: 'Status' | 'Org' | 'Jurisdiction';
        direction: SortDirection;
      }
    | undefined
  >();

  if (!getAllOrgsQuery.isSuccess) {
    return null;
  }
  const orgs = getAllOrgsQuery.data;

  const sortedElections = (() => {
    if (!sortState) {
      return elections;
    }

    const { field, direction } = sortState;

    function fieldValue(electionRecord: ElectionRecord): string | number {
      switch (field) {
        case 'Status':
          return electionStatus(electionRecord).valueOf();
        case 'Org':
          return find(orgs, (org) => org.id === electionRecord.orgId)
            .displayName;
        case 'Jurisdiction':
          return electionRecord.election.county.name;
        default: {
          /* istanbul ignore next - @preserve */
          throwIllegalValue(field);
        }
      }
    }
    return [...elections].sort((a, b) => {
      const aValue = fieldValue(a);
      const bValue = fieldValue(b);
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      throw new Error('Unexpected field value types');
    });
  })();

  const showJurisdiction = process.env.NODE_ENV !== 'production';

  return (
    <Table>
      <thead>
        <tr>
          <th>
            <SortHeaderButton
              direction={
                sortState?.field === 'Status' ? sortState.direction : undefined
              }
              onPress={(direction) => {
                if (direction) {
                  setSortState({ field: 'Status', direction });
                } else {
                  setSortState(undefined);
                }
              }}
            >
              Status
            </SortHeaderButton>
          </th>
          <th>
            <SortHeaderButton
              direction={
                sortState?.field === 'Org' ? sortState.direction : undefined
              }
              onPress={(direction) => {
                if (direction) {
                  setSortState({ field: 'Org', direction });
                } else {
                  setSortState(undefined);
                }
              }}
            >
              Org
            </SortHeaderButton>
          </th>
          {showJurisdiction && (
            <th>
              <SortHeaderButton
                direction={
                  sortState?.field === 'Jurisdiction'
                    ? sortState.direction
                    : undefined
                }
                onPress={(direction) => {
                  if (direction) {
                    setSortState({ field: 'Jurisdiction', direction });
                  } else {
                    setSortState(undefined);
                  }
                }}
              >
                Jurisdiction
              </SortHeaderButton>
            </th>
          )}
          <th>Title</th>
          <th>Date</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {sortedElections.map((electionRecord) => {
          const { election, orgId } = electionRecord;
          return (
            <ElectionRow key={election.id}>
              <LinkCell election={election}>
                {STATUS_ELEMENTS[electionStatus(electionRecord)]}
              </LinkCell>

              <LinkCell election={election}>
                {orgs.find((org) => org.id === orgId)?.displayName || orgId}
              </LinkCell>

              {showJurisdiction && (
                <LinkCell election={election}>{election.county.name}</LinkCell>
              )}

              <LinkCell election={election}>
                {election.title || 'Untitled Election'}
              </LinkCell>

              <LinkCell election={election}>
                {election.date &&
                  format.localeDate(
                    election.date.toMidnightDatetimeWithSystemTimezone()
                  )}
              </LinkCell>

              <CloneButtonCell>
                <CloneElectionButton election={election} />
              </CloneButtonCell>
            </ElectionRow>
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
  const features = useUserFeatures();

  return (
    <Table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Date</th>
          <th>Jurisdiction</th>
          <th>State</th>
          {features.CREATE_ELECTION && <th />}
        </tr>
      </thead>
      <tbody>
        {elections.map(({ election }) => (
          <ElectionRow key={election.id}>
            <LinkCell election={election}>
              {election.title || 'Untitled Election'}
            </LinkCell>

            <LinkCell election={election}>
              {election.date &&
                format.localeDate(
                  election.date.toMidnightDatetimeWithSystemTimezone()
                )}
            </LinkCell>

            <LinkCell election={election}>{election.county.name}</LinkCell>

            <LinkCell election={election}>{election.state}</LinkCell>

            {features.CREATE_ELECTION && (
              <CloneButtonCell>
                <CloneElectionButton election={election} />
              </CloneButtonCell>
            )}
          </ElectionRow>
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
  useTitle(routes.root.title);
  return (
    <UserFeaturesProvider>
      <ElectionsScreenContents />
    </UserFeaturesProvider>
  );
}
