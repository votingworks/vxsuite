import React from 'react';
import styled from 'styled-components';
import {
  Caption as CaptionBase,
  DesktopPalette,
  Font,
  H2,
} from '@votingworks/ui';

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
  padding: 0;
  position: relative;
  scroll-padding: var(--entity-list-scroll-padding);

  > :last-child {
    flex-grow: 1;
  }
`;

const Header = styled(H2)`
  background-color: ${(p) => p.theme.colors.containerLow};
  border-bottom: var(--entity-list-border);
  border-bottom-width: ${(p) => p.theme.sizes.bordersRem.medium}rem;
  font-size: var(--entity-list-title-size);
  line-height: 1;
  margin: 0;
  padding: var(--entity-list-title-padding-y) 1rem;
  white-space: nowrap;

  :not(:first-child) {
    border-top: var(--entity-list-border);
    margin: 0;
  }
`;

const Items = styled.div`
  min-height: max-content;

  :last-child {
    padding-bottom: 1rem;
  }
`;

const Label = styled(Font)`
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

const Caption = styled(CaptionBase)`
  color: ${(p) => p.theme.colors.onBackgroundMuted};

  :empty {
    display: none;
  }
`;

const ItemContainer = styled.li<{ hasWarning?: boolean }>`
  /* stylelint-disable value-keyword-case */
  align-items: center;
  border-bottom: var(--entity-list-border);
  border-color: ${DesktopPalette.Gray30};
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0.5rem 1rem;
  text-decoration: none;
  transition-duration: 100ms;
  transition-property: background, border, box-shadow, color;
  transition-timing-function: ease-out;

  ${(p) =>
    p.hasWarning &&
    `
    background-color: ${DesktopPalette.Orange5};
  `}

  :focus,
  :hover {
    background: ${(p) =>
      p.hasWarning
        ? p.theme.colors.warningContainer
        : p.theme.colors.containerLow};
    box-shadow: inset 0.25rem 0 0
      ${(p) =>
        p.hasWarning ? DesktopPalette.Orange30 : DesktopPalette.Purple50};
    color: inherit;
    outline: none;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${(p) =>
      p.hasWarning ? DesktopPalette.Orange10 : DesktopPalette.Purple10};
    box-shadow: inset 0.35rem 0 0
      ${(p) =>
        p.hasWarning ? DesktopPalette.Orange30 : DesktopPalette.Purple60};

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
  id: string;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  selected: boolean;
  autoScrollIntoView?: boolean;
  hasWarning?: boolean;
}

function Item(props: EntityListItemProps): React.ReactNode {
  const {
    children,
    id,
    onSelect,
    onHover,
    selected,
    autoScrollIntoView,
    hasWarning,
  } = props;

  const ref = React.useRef<HTMLLIElement>(null);

  React.useLayoutEffect(() => {
    if (autoScrollIntoView && ref.current) {
      ref.current.scrollIntoView({ block: 'center' });
    }
  }, [autoScrollIntoView]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.repeat) return;

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
      hasWarning={hasWarning}
      onClick={() => onSelect(id)}
      onKeyDown={onKeyDown}
      onMouseEnter={onHover ? () => onHover(id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      ref={selected || autoScrollIntoView ? ref : undefined}
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
