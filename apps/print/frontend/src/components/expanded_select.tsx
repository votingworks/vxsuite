import React from 'react';

import { DesktopPalette, Icons } from '@votingworks/ui';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  width: 100%;
  height: 100%;
  overflow-y: auto;
`;

const SearchBox = styled.div`
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
    border-bottom: 3px solid ${(p) => p.theme.colors.outline};
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
  height: 100%;
`;

const StyledOption = styled.option`
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

export function ExpandedSelect({
  selectedValue,
  options,
  onSelect,
  onSearch,
}: {
  selectedValue: string;
  options: string[];
  onSelect: (selected: string) => void;
  onSearch?: (value: string) => void;
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
            placeholder={
              selectedValue ? `Selected: ${selectedValue}` : 'Search'
            }
            type="text"
          />
        </SearchBox>
      )}
      <OptionList>
        {options.map((option) => (
          <StyledOption
            key={option}
            aria-selected={option === selectedValue}
            onClick={() => onSelect(option)}
          >
            {option}
          </StyledOption>
        ))}
      </OptionList>
    </Container>
  );
}
