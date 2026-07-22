import { DesktopPalette, Icons } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import { BORDER_LIGHT, INSET_FOCUS_OUTLINE } from './styles';

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

export const SearchBoxContainer = styled.div`
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
    font-size: 0.9rem;
    padding: 0.5rem 0.25rem 0.5rem 0;

    ::placeholder {
      color: ${DesktopPalette.Gray60};
    }

    :focus {
      outline: 0;
    }
  }
`;

export interface SearchBoxProps {
  placeholder: string;
  query: string;
  setQuery: (q: string) => void;
}

export function SearchBox(props: SearchBoxProps): JSX.Element {
  const { placeholder, query, setQuery } = props;

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
    <SearchBoxContainer
      onKeyDown={onKeyDown}
      onClickCapture={() => inputRef.current?.focus()}
    >
      <IconContainer>
        <Icons.Search />
      </IconContainer>

      <input
        placeholder={placeholder}
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
    </SearchBoxContainer>
  );
}
