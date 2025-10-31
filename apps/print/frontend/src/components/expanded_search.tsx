import React from 'react';

import { DesktopPalette, Icons } from '@votingworks/ui';
import styled from 'styled-components';

const SearchBox = styled.div`
  box-shadow: 0 0.15rem 0.2rem #00000008;
  position: relative;

  svg {
    color: #aaa;
    position: absolute;
    left: 1.25rem;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  :focus-within {
    svg {
      color: ${DesktopPalette.Purple60};
    }
  }

  input {
    background: none;
    border: 0;
    border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom: 3px solid #aaa;
    margin: 0;
    padding: 0.75rem 0.5rem 0.5rem;
    padding-left: 2.5rem;
    width: 100%;

    :focus {
      border: none;
      outline: none;
      border-bottom: 3px solid ${DesktopPalette.Purple60};
    }
  }
`;

const OptionList = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: scroll;
  scrollbar-width: none;
  box-shadow:
    inset 0 0.15rem 0.2rem #00000008,
    inset 0 -0.15rem 0.2rem #00000008;
`;

const Container = styled.div`
  align-self: start;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border: 1px solid #ccc;
  box-shadow:
    0.05rem 0.075rem 0.1rem 0 #00000010,
    0.1rem 0.15rem 0.1rem 0.05rem #00000004,
    0.15rem 0.25rem 0.125rem 0.075rem #00000002;
  display: flex;
  flex-direction: column;
  // flex-grow: 1;
  max-height: 100%;
  overflow: hidden;
  width: 100%;
`;

const PrecinctSearchOption = styled.option`
  background: none;
  border: none;
  border-bottom: 1px solid #eee;
  box-shadow: inset 0 0 0 ${DesktopPalette.Purple40};
  box-sizing: border-box;
  color: #666 !important;
  cursor: pointer;
  display: block;
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  margin: 0;
  min-height: max-content;
  overflow-x: hidden;
  overflow-y: visible;
  padding: 0.75rem;
  text-align: left;
  text-decoration: none;
  text-overflow: ellipsis;
  transition-duration: 120ms;
  transition-property: background-color, border, color;
  transition-timing-function: ease-out;
  white-space: nowrap;

  :focus,
  :hover {
    background-color: ${DesktopPalette.Purple10} !important;
    box-shadow: inset 0.3rem 0 0 ${DesktopPalette.Purple40};
    color: #000 !important;
    filter: none !important;
    outline: none;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20} !important;
    box-shadow: inset 0.3rem 0 0 ${DesktopPalette.Purple60};
    color: #000 !important;
  }
`;

function Option(props: {
  name: string;
  iSelected: boolean;
  onClick?: (name: string) => void;
}): JSX.Element {
  const { name, iSelected, onClick } = props;

  return (
    <PrecinctSearchOption
      aria-selected={iSelected}
      role="option"
      onClick={() => onClick?.(name)}
    >
      {name}
    </PrecinctSearchOption>
  );
}

export function ExpandedSearch({
  // searchValue,
  selectedValue,
  searchResults,
  onSearch,
  onSelect,
}: {
  selectedValue: string;
  searchResults: string[];
  onSearch?: (value: string) => void;
  onSelect: (selected: string) => void;
}): JSX.Element {
  return (
    <Container>
      {onSearch && (
        <SearchBox>
          <Icons.Search />
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              const newSearchString = (event.target.value || '').trim();
              onSearch(newSearchString);
            }}
            placeholder="Search"
            type="text"
            //   defaultValue="Select precinct"
          />
        </SearchBox>
      )}
      <OptionList>
        {searchResults.map((result) => (
          <Option
            key={result}
            name={result}
            iSelected={result === selectedValue}
            onClick={onSelect}
          />
        ))}
      </OptionList>
    </Container>
  );
}
