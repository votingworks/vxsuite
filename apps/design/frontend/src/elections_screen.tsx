import { throwIllegalValue, unique } from '@votingworks/basics';
import { Caption, H1, Icons, MainContent } from '@votingworks/ui';
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
} from './api.js';
import { Column, Row } from './layout.js';
import { Header, NavScreen } from './nav_screen.js';
import { CreateElectionButton } from './create_election_button.js';
import { useTitle } from './hooks/use_title.js';
import { routes } from './routes.js';
import { CloneElectionButton } from './clone_election_button.js';
import { LoadElectionButton } from './load_election_button.js';
import { FilterInput } from './filter_input.js';
import {
  CardList,
  CardListItem,
  CardListItemSubtitle,
  CardListItemTitle,
} from './card_list.js';

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

const StatusContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 4rem;
`;

const StatusIcon = styled.div`
  font-size: 1.5rem;
`;

function Status({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}): JSX.Element {
  return (
    <StatusContainer>
      <StatusIcon>{icon}</StatusIcon>
      <Caption style={{ lineHeight: 1 }}>{label}</Caption>
    </StatusContainer>
  );
}

function ElectionStatus({
  election,
}: {
  election: ElectionListing;
}): JSX.Element {
  switch (election.status) {
    case 'notStarted':
    case 'inProgress':
      return (
        <Status icon={<Icons.Contrast color="warning" />} label="In Progress" />
      );
    case 'ballotsFinalized':
    case 'ballotsApproved':
      return <Status icon={<Icons.Done color="primary" />} label="Finalized" />;
    default: {
      throwIllegalValue(election.status);
    }
  }
}

const ContentContainer = styled.div`
  margin-top: -0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  flex: 1;
`;

function ElectionsList({
  elections,
  hasMultipleJurisdictions,
}: {
  elections: ElectionListing[];
  hasMultipleJurisdictions: boolean;
}): JSX.Element | null {
  const history = useHistory();

  return (
    <CardList>
      {elections.map((election) => (
        <CardListItem
          key={election.electionId}
          onPress={() => history.push(`/elections/${election.electionId}`)}
          leadingSlot={<ElectionStatus election={election} />}
          contentSlot={
            <ContentContainer>
              <CardListItemTitle>
                {election.title || 'Untitled Election'}
              </CardListItemTitle>
              <CardListItemSubtitle>
                {election.date &&
                  format.localeDate(
                    election.date.toMidnightDatetimeWithSystemTimezone()
                  )}
                {hasMultipleJurisdictions && (
                  <React.Fragment>
                    {` • ${election.jurisdictionName}`}
                  </React.Fragment>
                )}
              </CardListItemSubtitle>
            </ContentContainer>
          }
          trailingSlot={<CloneElectionButton election={election} />}
        />
      ))}
    </CardList>
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

  /* istanbul ignore next */
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
        <Column style={{ gap: '1rem' }}>
          <Row style={{ gap: '0.5rem' }}>
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

          <ElectionsList
            elections={filteredElections}
            hasMultipleJurisdictions={hasMultipleJurisdictions}
          />
        </Column>
      </MainContent>
    </NavScreen>
  );
}
