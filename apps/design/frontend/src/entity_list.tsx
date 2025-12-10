import React from 'react';
import styled from 'styled-components';

import {
  Caption as CaptionBase,
  DesktopPalette,
  Font,
  H2,
} from '@votingworks/ui';

import { cssThemedScrollbars } from './scrollbars';

const Box = styled.ul.attrs({ role: 'listbox' })`
  --entity-list-border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};
  --entity-list-title-size: 1.25rem;
  --entity-list-title-padding-y: 0.75rem;
  --entity-list-scroll-padding: calc(
    var(--entity-list-title-size) + (2 * var(--entity-list-title-padding-y))
  );

  display: flex;
  flex-direction: column;
  height: 100%;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 0 0.125rem 0 0;
  position: relative;
  scroll-padding: var(--entity-list-scroll-padding);

  > :last-child {
    flex-grow: 1;
  }

  ${cssThemedScrollbars}
`;

const Header = styled(H2)`
  background-color: ${(p) => p.theme.colors.containerLow};
  border-bottom: var(--entity-list-border);
  border-right: var(--entity-list-border);
  border-bottom-width: ${(p) => p.theme.sizes.bordersRem.medium}rem;
  font-size: var(--entity-list-title-size);
  line-height: 1;
  margin: 0;
  padding: var(--entity-list-title-padding-y) 1rem;
  position: sticky;
  top: 0;
  white-space: nowrap;

  :not(:first-child) {
    border-top: var(--entity-list-border);
    margin: 0;

    /*
       * The top border is only applied to the second sublist header for visual
       * separation from the first sublist.
       * Nudge it up to tuck its border under the list actions row border when
       * it sticks at the top:
       */
    top: -${(p) => p.theme.sizes.bordersRem.hairline}rem;
  }
`;

const Items = styled.div`
  border-right: var(--entity-list-border);
  min-height: max-content;

  :last-child {
    padding-bottom: 1rem;
  }
`;

const Label = styled(Font)`
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
`;

const Caption = styled(CaptionBase)`
  color: ${(p) => p.theme.colors.onBackgroundMuted};

  :empty {
    display: none;
  }
`;

const ItemContainer = styled.li`
  align-items: center;
  border-bottom: var(--entity-list-border);
  border-color: ${DesktopPalette.Gray10};
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0.75rem 1.25rem;
  text-decoration: none;
  transition-duration: 100ms;
  transition-property: background, border, box-shadow, color;
  transition-timing-function: ease-out;

  :focus,
  :hover {
    background: ${(p) => p.theme.colors.containerLow};
    box-shadow: inset 0.25rem 0 0 ${DesktopPalette.Purple50};
    color: inherit;
    outline: none;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple10};
    box-shadow: inset 0.35rem 0 0 ${DesktopPalette.Purple60};

    ${Label} {
      font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
    }

    ${Caption} {
      color: ${(p) => p.theme.colors.onBackground};
    }
  }
`;

export interface EntityListItemProps {
  children: React.ReactNode;
  className?: string;
  id: string;
  onSelect: (id: string) => void;
  selected: boolean;
}

function Item(props: EntityListItemProps): React.ReactNode {
  const { children, className, id, onSelect, selected } = props;

  const ref = React.useRef<HTMLLIElement>(null);

  React.useLayoutEffect(() => {
    if (ref.current) ref.current.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.repeat) return;

    // [TODO] Handle arrow key interaction a la W3C listbox pattern.
    switch (e.key) {
      case 'Enter':
      case ' ':
        break;

      default:
        return;
    }

    e.preventDefault();
    onSelect(id);
  }

  return (
    <ItemContainer
      aria-selected={selected}
      className={className}
      onClick={() => onSelect(id)}
      onKeyDown={onKeyDown}
      ref={selected ? ref : undefined}
      role="option"
      tabIndex={0}
    >
      {children}
    </ItemContainer>
  );
}

export const EntityList = {
  Caption,
  Box,
  Header,
  Item,
  Items,
  Label,
} as const;
