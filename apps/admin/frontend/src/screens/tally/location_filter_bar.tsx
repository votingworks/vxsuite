/* istanbul ignore file */

import { DesktopPalette, Icons, SegmentedButton } from '@votingworks/ui';
import styled from 'styled-components';
import React from 'react';
import { BORDER_LIGHT, BOX_SHADOW, INSET_FOCUS_OUTLINE } from './styles';

const IconContainer = styled.div`
  align-items: center;
  color: ${DesktopPalette.Gray40};
  display: flex;
  min-height: 100%;
  padding: 0 0.75rem;
`;

const ClearIcon = styled(IconContainer).attrs({ as: 'button' })`
  background-color: ${(p) => p.theme.colors.background};
  border: 0;
  cursor: pointer;
  transition: 100ms ease-out background-color;

  :focus,
  :hover {
    background-color: ${(p) => p.theme.colors.primaryContainer};
    color: ${(p) => p.theme.colors.primary};
    outline: 0;
  }
`;

const SearchInput = styled.div<{ layered?: boolean }>`
  ${BORDER_LIGHT}

  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: grid;
  grid-auto-columns: min-content 1fr min-content;
  grid-auto-flow: column;
  overflow: hidden;
  position: relative;

  :focus-within {
    ${INSET_FOCUS_OUTLINE}

    > ${IconContainer} {
      color: ${(p) => p.theme.colors.primary};
    }
  }

  > input {
    background-color: ${(p) => p.theme.colors.background};
    border: 0;
    border-radius: 0;
    padding: 0;

    ::placeholder {
      color: ${DesktopPalette.Gray60};
    }

    :focus {
      outline: 0;
    }
  }
`;

const Container = styled.div`
  ${BOX_SHADOW}

  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: grid;
  grid-template-columns: 1fr min-content;
  transition: all 200ms ease-in;

  > ${SearchInput} {
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

  const inputRef = React.useRef<HTMLInputElement>(null);

  function clearQuery() {
    setQuery('');
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'Escape':
        clearQuery();
        break;
      default:
        break;
    }
  }

  return (
    <Container onKeyDown={onKeyDown}>
      <SearchInput onClickCapture={() => inputRef.current?.focus()}>
        <IconContainer>
          <Icons.Search />
        </IconContainer>

        <input
          placeholder="Search Locations"
          ref={inputRef}
          onChange={(e) => setQuery(e.target.value)}
          type="text"
          value={query}
        />

        {query && (
          <ClearIcon aria-label="Clear Search Query" onClick={clearQuery}>
            <Icons.X />
          </ClearIcon>
        )}
      </SearchInput>

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
