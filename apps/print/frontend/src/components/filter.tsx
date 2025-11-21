import { Button, DesktopPalette, Icons } from '@votingworks/ui';
import { useRef } from 'react';
import styled from 'styled-components';

const ClearButton = styled(Button)`
  position: absolute;
  color: #aaa;
  right: 0.125rem;
  top: 0.375rem;
  padding: 0.5rem;
`;

const SearchBox = styled.div`
  position: relative;
  border: 2px solid ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  flex-grow: 1;

  /* Apply to the search icon only */
  > svg {
    position: absolute;
    color: #aaa;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
  }

  /* Apply to the search and clear icons */
  :focus-within {
    svg {
      color: ${DesktopPalette.Purple60};
    }
  }

  input {
    background: none;
    border: none;
    margin: 0;
    padding: 0.75rem 0.5rem 0.675rem;
    padding-left: 2.5rem;
    width: 100%;

    :focus {
      box-shadow: 0 0 0 3px ${DesktopPalette.Purple60};
      outline: none;
    }
  }
`;

export function Filter({
  filterText,
  setFilterText,
}: {
  filterText: string;
  setFilterText: (text: string) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <SearchBox>
      <Icons.Search />
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        type="text"
        aria-label="Filter table by precinct name"
        placeholder="Filter by precinct name"
        value={filterText}
        style={{ width: '100%' }}
        onChange={(e) => setFilterText(e.target.value)}
        ref={inputRef}
      />
      <ClearButton
        fill="transparent"
        icon="X"
        aria-label="Clear"
        onPress={() => {
          setFilterText('');
          inputRef.current?.focus();
        }}
      />
    </SearchBox>
  );
}
