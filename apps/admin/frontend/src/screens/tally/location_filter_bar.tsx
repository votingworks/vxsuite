import { SegmentedButton } from '@votingworks/ui';
import styled from 'styled-components';
import React from 'react';
import { BORDER_LIGHT, BOX_SHADOW, INSET_FOCUS_OUTLINE } from './styles';
import { SearchBox, SearchBoxContainer } from './search_box';

const Container = styled.div`
  ${BOX_SHADOW}

  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: grid;
  grid-template-columns: 1fr min-content;
  transition: all 200ms ease-in;

  > ${SearchBoxContainer} {
    border-bottom-right-radius: 0;
    border-top-right-radius: 0;
  }

  /*
   * The location filter segmented button.
   * [TODO] Add options for customizing SegmentedButton to make this
   * less brittle.
   */
  > :last-child {
    > * {
      ${BORDER_LIGHT}
      height: 100%;
      border-left: 0;

      > button {
        border-radius: 0;
        height: 100%;
        padding: 0 0.6rem;

        :focus:focus-visible {
          ${INSET_FOCUS_OUTLINE}
        }

        :first-child {
          border-left: 0;
        }

        :not(:first-child) {
          ${BORDER_LIGHT}
          border-bottom: 0;
          border-right: 0;
          border-top: 0;
        }

        :last-child {
          border-bottom-right-radius: ${(p) =>
            p.theme.sizes.borderRadiusRem}rem;
          border-top-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
        }
      }
    }
  }
`;

export type LocationFilter = 'all' | 'loaded' | 'pending';

export interface LocationFilterBarProps {
  filter: LocationFilter;
  nLocations: number;
  nLoaded: number;
  query: string;
  setQuery: (q: string) => void;
  setFilter: (f: LocationFilter) => void;
}

export function LocationFilterBar(
  props: LocationFilterBarProps
): React.ReactNode {
  const { filter, nLoaded, nLocations, query, setFilter, setQuery } = props;
  const nPending = nLocations - nLoaded;

  return (
    <Container>
      <SearchBox
        placeholder="Search Locations"
        query={query}
        setQuery={setQuery}
      />

      <SegmentedButton<LocationFilter>
        collapseLeft
        label="Status"
        hideLabel
        onChange={setFilter}
        options={[
          { id: 'all', label: filterLabel('All', nLocations) },
          { id: 'loaded', label: filterLabel('Loaded', nLoaded) },
          { id: 'pending', label: filterLabel('Pending', nPending) },
        ]}
        selectedOptionId={filter}
      />
    </Container>
  );
}

const FilterLabelContainer = styled.div`
  align-items: baseline;
  display: flex;
  font-size: 0.9rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  gap: 0.5rem;
`;

const FilterLabelCount = styled.span`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 0.75em;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
`;

function filterLabel(label: string, count: number): JSX.Element {
  return (
    <FilterLabelContainer>
      <span>{label}</span>
      <FilterLabelCount>{count}</FilterLabelCount>
    </FilterLabelContainer>
  );
}
