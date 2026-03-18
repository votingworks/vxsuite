import React from 'react';
import styled from 'styled-components';

import { Callout } from '@votingworks/ui';
import { PollingPlace, pollingPlaceGroups } from '@votingworks/types';

import { Column } from './layout';
import { EntityList } from './entity_list';

const NoPollingPlaces = styled.div`
  padding: 1rem;
`;

export interface PollingPlaceListProps {
  onSelect: (id: string) => void;
  places: PollingPlace[];
  selectedId?: string;
}

export function PollingPlaceList(
  props: PollingPlaceListProps
): React.ReactNode {
  const { onSelect, places, selectedId } = props;
  const groups = React.useMemo(() => pollingPlaceGroups(places), [places]);

  return (
    <EntityList.Box>
      {places.length === 0 && (
        <NoPollingPlaces>
          <Callout color="neutral" icon="Info">
            You haven&apos;t added any polling places to this election yet.
          </Callout>
        </NoPollingPlaces>
      )}
      <Sublist
        title="Absentee Voting"
        onSelect={onSelect}
        places={groups.absentee}
        selectedId={selectedId}
      />
      <Sublist
        title="Early Voting"
        onSelect={onSelect}
        places={groups.early_voting}
        selectedId={selectedId}
      />
      <Sublist
        title="Election Day"
        onSelect={onSelect}
        places={groups.election_day}
        selectedId={selectedId}
      />
    </EntityList.Box>
  );
}

export function Sublist(
  props: PollingPlaceListProps & { title: string }
): React.ReactNode {
  const { onSelect, places, selectedId, title } = props;
  const { Caption, Header, Item, Items, Label } = EntityList;

  if (places.length === 0) return null;

  return (
    <React.Fragment>
      <Header>{title}</Header>
      {places.length > 0 && (
        <Items>
          {places.map((p) => (
            <Item
              id={p.id}
              key={p.id}
              onSelect={onSelect}
              selected={p.id === selectedId}
            >
              <Column>
                <Label>{p.name}</Label>
                <Caption noWrap>{precinctCountLabel(p)}</Caption>
              </Column>
            </Item>
          ))}
        </Items>
      )}
    </React.Fragment>
  );
}

function precinctCountLabel(p: PollingPlace) {
  const nPrecincts = Object.keys(p.precincts).length;
  return nPrecincts === 1
    ? `${nPrecincts} Precinct`
    : `${nPrecincts} Precincts`;
}
