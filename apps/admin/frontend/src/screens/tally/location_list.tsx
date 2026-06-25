import React from 'react';
import styled from 'styled-components';

import { Id, PollingPlace } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';

import { LocationCvrs } from './cvrs_state';
import { LocationCvrsPanel } from './location_cvrs_panel';
import { LocationStatusCard } from './location_status_card';
import { GAP, INSET_FOCUS_OUTLINE } from './styles';

export interface LocationListProps {
  locationCvrs: Map<Id, LocationCvrs>;
  locations: readonly PollingPlace[];
}

const Container = styled.div<{ showingDetails: boolean }>`
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: grid;
  grid-template-columns: 3fr ${(p) => (p.showingDetails ? 2 : 0)}fr;
  gap: ${(p) => (p.showingDetails ? GAP : 0)};
  height: 100%;
  overflow-y: hidden;
  transition: 100ms ease-out;
  transition-property: gap, grid-template-columns;
  scroll-padding-bottom: 1rem;
  scroll-padding-top: 1rem;

  :focus:focus-visible {
    ${INSET_FOCUS_OUTLINE}
  }
`;

const Details = styled.div`
  min-width: 0;
  height: 100%;
  overflow: hidden;
`;

const ListScrollContainer = styled.div`
  max-height: 100%;
  overflow-y: auto;
`;

const ListItems = styled.div`
  align-items: start;
  display: grid;
  gap: ${GAP};
  padding-right: 0.125rem; /* Make room for scrollbar. */
`;

export function LocationList(props: LocationListProps): React.ReactNode {
  const { locationCvrs, locations } = props;
  const [selectedId, setSelectedId] = React.useState<string>();

  function toggleSelected(id: string) {
    setSelectedId(id === selectedId ? undefined : id);
  }

  const selected = locations.find((l) => l.id === selectedId);

  return (
    <Container showingDetails={!!selected}>
      <ListScrollContainer>
        <ListItems>
          {locations.map((l) => (
            <LocationCard
              key={l.id}
              location={l}
              locationCvrs={locationCvrs}
              onPress={toggleSelected}
              selected={l.id === selectedId}
            />
          ))}
        </ListItems>
      </ListScrollContainer>

      <Details>
        {selected && (
          <LocationCvrsPanel
            closePanel={() => setSelectedId(undefined)}
            imports={assertDefined(locationCvrs.get(selected.id)).files}
            name={selected.name}
            type={selected.type}
          />
        )}
      </Details>
    </Container>
  );
}

function LocationCard(props: {
  locationCvrs: Map<Id, LocationCvrs>;
  location: PollingPlace;
  onPress: (id: string) => void;
  selected: boolean;
}) {
  const { location, locationCvrs, onPress, selected } = props;
  const cvrs = assertDefined(locationCvrs.get(location.id));

  return (
    <LocationStatusCard
      id={location.id}
      name={location.name}
      cvrCount={cvrs.cvrCount}
      onPress={onPress}
      importCount={cvrs.files.length}
      scannerIds={[...cvrs.scannerIds]}
      type={location.type}
      selected={selected}
    />
  );
}
