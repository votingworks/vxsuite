import { unique } from '@votingworks/basics';
import { H1, MainContent, Table } from '@votingworks/ui';
import React from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import type { ElectionListing } from '@votingworks/design-backend';
import {
  listElections,
  createElection,
  loadElection,
  cloneElection,
} from './api';
import { Column, Row } from './layout';
import { Header, NavScreen } from './nav_screen';
import { CreateElectionButton } from './create_election_button';
import { useTitle } from './hooks/use_title';
import { routes } from './routes';
import { CloneElectionButton } from './clone_election_button';
import { LoadElectionButton } from './load_election_button';
import { FilterInput } from './filter_input';

export const ElectionRow = styled.tr`
  & td {
    padding: 0.75rem 0.5rem;
  }

  &:hover {
    background-color: ${(p) => p.theme.colors.containerLow};
  }
`;

export const ActionIconButtonCell = styled.td`
  text-align: center;
`;

const LinkCellContainer = styled.td`
  cursor: pointer;
`;

export function LinkCell(
  props: { election: ElectionListing } & React.PropsWithChildren
): React.ReactNode {
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

function ElectionsList({
  elections,
  hasMultipleJurisdictions,
}: {
  elections: ElectionListing[];
  hasMultipleJurisdictions: boolean;
}): JSX.Element | null {
  return (
    <Table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Date</th>
          {hasMultipleJurisdictions && <th>Jurisdiction</th>}
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

            {hasMultipleJurisdictions && (
              <LinkCell election={election}>
                {election.jurisdictionName}
              </LinkCell>
            )}

            <ActionIconButtonCell>
              <CloneElectionButton election={election} />
            </ActionIconButtonCell>
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
  const createElectionMutation = createElection.useMutation();
  const loadElectionMutation = loadElection.useMutation();
  const cloneElectionMutation = cloneElection.useMutation();

  /* istanbul ignore next - @preserve */
  if (!listElectionsQuery.isSuccess) {
    return null;
  }
  const elections = listElectionsQuery.data;
  const hasMultipleJurisdictions =
    unique(elections.map((e) => e.jurisdictionId)).length > 1;
  // Filter by matching jurisdiction (if multiple) or election title
  const filteredElections = elections.filter(
    (e) =>
      (hasMultipleJurisdictions &&
        e.jurisdictionName.toLowerCase().includes(filterText.toLowerCase())) ||
      e.title.toLowerCase().includes(filterText.toLowerCase())
  );

  const anyMutationIsLoading =
    loadElectionMutation.isLoading ||
    createElectionMutation.isLoading ||
    cloneElectionMutation.isLoading;

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
            <FilterInput
              value={filterText}
              onChange={setFilterText}
              autoFocus
              aria-label="Filter elections"
              placeholder={
                hasMultipleJurisdictions
                  ? 'Filter by jurisdiction or election title'
                  : 'Filter by election title'
              }
              style={{ flexGrow: 1 }}
            />
            <CreateElectionButton
              disabled={anyMutationIsLoading}
              variant={elections.length === 0 ? 'primary' : undefined}
            />
            <LoadElectionButton disabled={anyMutationIsLoading} />
          </Row>

          <div style={{ overflow: 'auto' }}>
            <ElectionsList
              elections={filteredElections}
              hasMultipleJurisdictions={hasMultipleJurisdictions}
            />
          </div>
        </Column>
      </MainContent>
    </NavScreen>
  );
}
