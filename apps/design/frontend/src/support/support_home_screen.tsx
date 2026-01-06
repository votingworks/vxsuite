import styled from 'styled-components';
import {
  Button,
  H1,
  Icons,
  MainContent,
  StyledButtonProps,
  Table,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { throwIllegalValue } from '@votingworks/basics';
import { ElectionListing, ElectionStatus } from '@votingworks/design-backend';
import { useMemo, useRef } from 'react';
import { useLocation, useHistory } from 'react-router-dom';
import * as api from '../api';
import { Header, NavScreen } from '../nav_screen';
import { CloneElectionButton } from '../clone_election_button';
import { Column, Row } from '../layout';
import {
  ActionIconButtonCell,
  ElectionRow,
  LinkCell,
} from '../elections_screen';
import { CreateElectionButton } from '../create_election_button';
import { LoadElectionButton } from '../load_election_button';

const SupportHeader = styled(Header)`
  background-color: ${(p) => p.theme.colors.warningContainer};
`;

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
      <Icons.Done color="primary" /> Ballots finalized
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
        field: 'Status' | 'Jurisdiction';
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
        case 'Jurisdiction':
          return election.jurisdictionName;
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

            <LinkCell election={election}>{election.jurisdictionName}</LinkCell>

            <LinkCell election={election}>
              {election.title || 'Untitled Election'}
            </LinkCell>

            <LinkCell election={election}>
              {election.date &&
                format.localeDate(
                  election.date.toMidnightDatetimeWithSystemTimezone()
                )}
            </LinkCell>

            <ActionIconButtonCell>
              <CloneElectionButton election={election} />
            </ActionIconButtonCell>
          </ElectionRow>
        ))}
      </tbody>
    </Table>
  );
}

export function SupportHomeScreen({
  filterText,
  setFilterText,
}: {
  filterText: string;
  setFilterText: (text: string) => void;
}): React.ReactNode {
  const listElectionsQuery = api.listElections.useQuery();
  const createElectionMutation = api.createElection.useMutation();
  const loadElectionMutation = api.loadElection.useMutation();
  const cloneElectionMutation = api.cloneElection.useMutation();
  const filterRef = useRef<HTMLInputElement>(null);

  if (!listElectionsQuery.isSuccess) {
    return null;
  }
  const elections = listElectionsQuery.data;

  const filteredElections = elections.filter(
    (election) =>
      election.jurisdictionName
        .toLowerCase()
        .includes(filterText.toLowerCase()) ||
      election.title.toLowerCase().includes(filterText.toLowerCase())
  );

  const anyMutationIsLoading =
    createElectionMutation.isLoading ||
    loadElectionMutation.isLoading ||
    cloneElectionMutation.isLoading;

  return (
    <NavScreen>
      <SupportHeader>
        <H1>Support Tools</H1>
      </SupportHeader>
      <MainContent>
        <Column style={{ gap: '1rem', height: '100%', overflow: 'hidden' }}>
          <Row
            style={{
              gap: '0.5rem',
              // Leave space for focus outlines on buttons/input, which
              // otherwise overflow and are hidden
              margin: '0.125rem',
            }}
          >
            <div style={{ position: 'relative', flexGrow: 1 }}>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                ref={filterRef}
                type="text"
                aria-label="Filter elections"
                placeholder="Filter by jurisdiction or election title"
                value={filterText}
                style={{ width: '100%' }}
                onChange={(e) => setFilterText(e.target.value)}
              />
              <Button
                style={{
                  position: 'absolute',
                  right: '0.125rem',
                  top: '0.125rem',
                  padding: '0.5rem',
                }}
                fill="transparent"
                icon="X"
                aria-label="Clear"
                onPress={() => {
                  setFilterText('');
                  filterRef.current?.focus();
                }}
              />
            </div>
            <CreateElectionButton disabled={anyMutationIsLoading} />
            <LoadElectionButton disabled={anyMutationIsLoading} />
          </Row>
          <div style={{ overflow: 'auto' }}>
            <AllOrgsElectionsList elections={filteredElections} />
          </div>
        </Column>
      </MainContent>
    </NavScreen>
  );
}
