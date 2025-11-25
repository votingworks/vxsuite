import React, { useEffect, useRef } from 'react';

import { DesktopPalette, Icons } from '@votingworks/ui';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  width: 100%;
  height: 100%;
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
  overflow-y: auto;
  height: 100%;
  position: relative;
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
  style,
}: {
  selectedValue: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (selected: string) => void;
  onSearch?: (value: string) => void;
  style?: React.CSSProperties;
}): JSX.Element {
  const optionListRef = useRef<HTMLDivElement>(null);
  const selectedOptionRef = useRef<HTMLOptionElement>(null);

  // Scroll to selected option if not visible
  useEffect(() => {
    if (selectedOptionRef.current && optionListRef.current) {
      const option = selectedOptionRef.current;
      const list = optionListRef.current;

      const isInView =
        option.offsetTop >= list.scrollTop &&
        option.offsetTop + option.offsetHeight <=
          list.scrollTop + list.clientHeight;

      if (!isInView) {
        option.scrollIntoView({
          behavior: 'instant',
          block: 'start',
        });
      }
    }
  }, [selectedValue]);

  return (
    <Container style={style}>
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
          />
        </SearchBox>
      )}
      <OptionList ref={optionListRef}>
        {options.map((option) => (
          <StyledOption
            key={option.value}
            ref={option.value === selectedValue ? selectedOptionRef : null}
            aria-selected={option.value === selectedValue}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </StyledOption>
        ))}
      </OptionList>
    </Container>
  );
}
