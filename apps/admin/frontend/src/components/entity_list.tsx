import React from 'react';
import styled from 'styled-components';
import { Caption as CaptionBase, DesktopPalette, Font } from '@votingworks/ui';

const Box = styled.ul.attrs({ role: 'listbox' })`
  --entity-list-border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};
  --entity-list-title-size: 1.125rem;

  display: flex;
  flex-direction: column;
  height: 100%;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 0;

  > :last-child {
    flex-grow: 1;
  }
`;

const Header = styled.div`
  background-color: ${(p) => p.theme.colors.container};
  border-bottom: var(--entity-list-border);
  border-bottom-width: ${(p) => p.theme.sizes.bordersRem.thin}rem;
  font-size: var(--entity-list-title-size);
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  line-height: 1;
  margin: 0;
  padding: 0.5rem 0.75rem;
  position: sticky;
  top: 0;
  white-space: nowrap;

  :not(:first-child) {
    border-top: var(--entity-list-border);
    border-top-width: ${(p) => p.theme.sizes.bordersRem.thin}rem;
  }
`;

const Items = styled.div`
  min-height: max-content;
`;

const Label = styled(Font)`
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

const Caption = styled(CaptionBase)`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
`;

const ItemContainer = styled.li<{ hasWarning: boolean }>`
  /* stylelint-disable value-keyword-case */

  align-items: center;
  border-bottom: var(--entity-list-border);
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  transition-duration: 100ms;
  transition-property: background, border, box-shadow, color;
  transition-timing-function: ease-out;

  ${(p) => p.hasWarning && `background-color: ${DesktopPalette.Orange5};`}

  :last-child {
    border-bottom: none;
  }

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

  :active {
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
  onHover: (id: string | null) => void;
  autoScrollIntoView: boolean;
  hasWarning: boolean;
}

function Item(props: EntityListItemProps): React.ReactNode {
  const { children, id, onSelect, onHover, autoScrollIntoView, hasWarning } =
    props;

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
      aria-selected={false}
      hasWarning={hasWarning}
      onClick={() => onSelect(id)}
      onKeyDown={onKeyDown}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      ref={autoScrollIntoView ? ref : undefined}
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
