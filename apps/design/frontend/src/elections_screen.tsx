import { assert, Result, throwIllegalValue } from '@votingworks/basics';
import { Id } from '@votingworks/types';
import {
  H1,
  Icons,
  MainContent,
  FileInputButton,
  Table,
  Button,
  StyledButtonProps,
} from '@votingworks/ui';
import { FormEvent, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import type {
  ElectionListing,
  ElectionStatus,
} from '@votingworks/design-backend';
import {
  listElections,
  createElection,
  loadElection,
  getUser,
  getUserFeatures,
} from './api';
import { Column, Row } from './layout';
import { Header, NavScreen } from './nav_screen';
import { CreateElectionButton } from './create_election_button';
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

function LinkCell(
  props: { election: ElectionListing } & React.PropsWithChildren
) {
  const { children, election } = props;
  const history = useHistory();

  return (
    <LinkCellContainer
      onClick={() => history.push(`/elections/${election.electionId}`)}
    >
      {children}
    </LinkCellContainer>
  );
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
  notStarted: (
    <span>
      <Icons.Closed color="danger" /> Not started
    </span>
  ),
  inProgress: (
    <span>
      <Icons.Circle color="warning" /> In progress
    </span>
  ),
  ballotsFinalized: (
    <span>
      <Icons.CircleDot color="primary" /> Ballots finalized
    </span>
  ),
  orderSubmitted: (
    <span>
      <Icons.Done color="success" /> Order submitted
    </span>
  ),
};

function AllOrgsElectionsList({
  elections,
}: {
  elections: ElectionListing[];
}): JSX.Element | null {
  const [sortState, setSortState] = useQueryParamsState<
    | {
        field: 'Status' | 'Org' | 'Jurisdiction';
        direction: SortDirection;
      }
    | undefined
  >();

  const sortedElections = (() => {
    if (!sortState) {
      return elections;
    }

    const { field, direction } = sortState;

    function fieldValue(election: ElectionListing): string | number {
      switch (field) {
        case 'Status':
          return election.status;
        case 'Org':
          return election.orgName;
        case 'Jurisdiction':
          return election.jurisdiction;
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
        {sortedElections.map((election) => (
          <ElectionRow key={election.electionId}>
            <LinkCell election={election}>
              {STATUS_ELEMENTS[election.status]}
            </LinkCell>

            <LinkCell election={election}>{election.orgName}</LinkCell>

            {showJurisdiction && (
              <LinkCell election={election}>{election.jurisdiction}</LinkCell>
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
        ))}
      </tbody>
    </Table>
  );
}

function SingleOrgElectionsList({
  elections,
}: {
  elections: ElectionListing[];
}): JSX.Element | null {
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  /* istanbul ignore next - @preserve */
  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;

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
        {elections.map((election) => (
          <ElectionRow key={election.electionId}>
            <LinkCell election={election}>
              {election.title || 'Untitled Election'}
            </LinkCell>

            <LinkCell election={election}>
              {election.date &&
                format.localeDate(
                  election.date.toMidnightDatetimeWithSystemTimezone()
                )}
            </LinkCell>

            <LinkCell election={election}>{election.jurisdiction}</LinkCell>

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

export function ElectionsScreen(): JSX.Element | null {
  useTitle(routes.root.title);
  const listElectionsQuery = listElections.useQuery();
  const createElectionMutation = createElection.useMutation();
  const loadElectionMutation = loadElection.useMutation();
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const user = getUser.useQuery().data;
  const history = useHistory();

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

  /* istanbul ignore next - @preserve */
  if (!(listElectionsQuery.isSuccess && getUserFeaturesQuery.isSuccess)) {
    return null;
  }
  const elections = listElectionsQuery.data;
  const features = getUserFeaturesQuery.data;

  return (
    <NavScreen>
      <Header>
        <H1>Elections</H1>
      </Header>
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
