/* istanbul ignore file */

import { Icons, SegmentedButton } from '@votingworks/ui';
import styled, { css } from 'styled-components';
import React from 'react';
import {
  FilterBarMode,
  PrecinctFilter,
  useFilterBarMode,
  useLayers,
  useLoadedPrecinctCount,
  usePollingPlaces,
  usePrecinctFilter,
  usePrecinctSearch,
  useSetPrecinctFilter,
  useSetPrecinctSearch,
} from './00_hooks';

const FilterIcon = styled.div`
  align-items: center;
  color: #aaa;
  display: flex;
  min-height: 100%;
  padding: 0 0.75rem;
`;

const FilterInput = styled.div<{ layered?: boolean }>`
  border: 1px solid #cecece;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: grid;
  grid-template-columns: min-content 1fr;
  overflow: hidden;

  > * {
    background-color: ${(p) => p.theme.colors.background};
    border: 0;
    border-radius: 0;

    :focus {
      outline: 0;
    }
  }

  > input {
    padding: 0;

    ::placeholder {
      color: #666;
    }
  }

  :focus-within {
    outline: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
      ${(p) => p.theme.colors.primary};
    outline-offset: -${(p) => p.theme.sizes.bordersRem.medium}rem;

    > ${FilterIcon} {
      color: ${(p) => p.theme.colors.primary};
    }
  }
`;

const filterFirstCss = css`
  grid-template-columns: min-content 1fr;

  ${FilterInput} {
    border-bottom-left-radius: 0;
    border-top-left-radius: 0;
  }

  > :first-child {
    > * {
      border-right: 0;
    }

    button:not(:last-child) {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    button:not(:first-child) {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
      border-left: 1px solid #333;
    }
  }
`;

const searchFirstCss = css`
  grid-template-columns: 1fr min-content;

  ${FilterInput} {
    border-bottom-right-radius: 0;
    border-top-right-radius: 0;
  }

  > :last-child {
    > * {
      border-left: 0;
    }

    button:not(:first-child) {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
      border-left: 1px solid #ccc;
    }

    button:not(:last-child) {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
  }
`;

const layeredContainerCss = css`
  box-shadow: 0.125rem 0.125rem 0.25rem rgba(0, 0, 0, 10%);
  transition: all 200ms ease-in;
`;

const Container = styled.div<{ layered?: boolean; mode: FilterBarMode }>`
  display: grid;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;

  /* box-shadow: 0 0 0 rgba(0, 0, 0, 0); */
  transition: all 200ms ease-out;

  ${(p) => p.layered && layeredContainerCss}

  > ${FilterInput} {
    :focus {
      outline-offset: -${(p) => p.theme.sizes.bordersRem.medium}rem;
    }
  }

  > :not(${FilterInput}) {
    > * {
      border: 1px solid #cecece;
      height: 100%;
    }

    button {
      /* border-radius: 0.25rem; */
      height: 100%;
      padding: 0 0.6rem;

      :focus {
        outline-offset: -${(p) => p.theme.sizes.bordersRem.medium}rem;
      }
    }
  }

  ${(p) => (p.mode === 'searchFirst' ? searchFirstCss : filterFirstCss)}
`;

export function FilterBar(): JSX.Element | null {
  const nLocations = usePollingPlaces().length;
  const nLoaded = useLoadedPrecinctCount();
  const nPending = nLocations - nLoaded;

  const layered = useLayers();
  const mode = useFilterBarMode();
  const filter = usePrecinctFilter();
  const search = usePrecinctSearch();

  const setFilter = useSetPrecinctFilter();
  const setSearch = useSetPrecinctSearch();

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'Escape':
        setSearch('');
        break;

      default:
        break;
    }
  }

  const filterInput = (
    <FilterInput>
      <FilterIcon>
        <Icons.Search />
      </FilterIcon>
      <input
        placeholder="Search Locations"
        onChange={(e) => setSearch(e.target.value)}
        type="text"
        value={search}
      />
    </FilterInput>
  );

  return (
    <Container layered={layered} mode={mode} onKeyDown={onKeyDown}>
      {mode === 'searchFirst' && filterInput}
      <SegmentedButton<PrecinctFilter>
        collapseLeft={mode === 'searchFirst'}
        collapseRight={mode === 'filterFirst'}
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
      {mode === 'filterFirst' && filterInput}
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
