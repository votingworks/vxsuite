import { throwIllegalValue } from '@votingworks/basics';
import {
  H1,
  Icons,
  MainContent,
  Table,
  Button,
  StyledButtonProps,
} from '@votingworks/ui';
import { useMemo, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import type {
  ElectionListing,
  ElectionStatus,
} from '@votingworks/design-backend';
import { listElections, getUserFeatures } from './api';
import { Column, Row } from './layout';
import { Header, NavScreen } from './nav_screen';
import { CreateElectionButton } from './create_election_button';
import { useTitle } from './hooks/use_title';
import { routes } from './routes';
import { CloneElectionButton } from './clone_election_button';
import { LoadElectionButton } from './load_election_button';

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
  return (
    <Table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Date</th>
          <th>Jurisdiction</th>
          <th>State</th>
          <th />
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

            <CloneButtonCell>
              <CloneElectionButton election={election} />
            </CloneButtonCell>
          </ElectionRow>
        ))}
      </tbody>
    </Table>
  );
}

interface Props {
  filterText: string;
  setFilterText: (text: string) => void;
}

export function ElectionsScreen({
  filterText,
  setFilterText,
}: Props): JSX.Element | null {
  useTitle(routes.root.title);
  const listElectionsQuery = listElections.useQuery();
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const filterRef = useRef<HTMLInputElement>(null);

  /* istanbul ignore next - @preserve */
  if (!(listElectionsQuery.isSuccess && getUserFeaturesQuery.isSuccess)) {
    return null;
  }
  const features = getUserFeaturesQuery.data;
  const elections = listElectionsQuery.data;
  // Filter by matching organization (if user has access to all orgs) or election title
  const filteredElections = elections.filter(
    (e) =>
      (features.ACCESS_ALL_ORGS &&
        e.orgName.toLowerCase().includes(filterText.toLowerCase())) ||
      e.title.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <NavScreen>
      <Header>
        <H1>Elections</H1>
      </Header>
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
                placeholder={
                  features.ACCESS_ALL_ORGS
                    ? 'Filter by organization or election title'
                    : 'Filter by election title'
                }
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
            <CreateElectionButton
              variant={elections.length === 0 ? 'primary' : undefined}
            />
            <LoadElectionButton />
          </Row>

          <div style={{ overflow: 'auto' }}>
            {features.ACCESS_ALL_ORGS ? (
              <AllOrgsElectionsList elections={filteredElections} />
            ) : (
              <SingleOrgElectionsList elections={filteredElections} />
            )}
          </div>
        </Column>
      </MainContent>
    </NavScreen>
  );
}
