import React from 'react';
import styled from 'styled-components';
import { Button } from '../button';
import { Icons } from '../icons';

export interface TabBarProps<Id extends string = string> {
  activePaneId?: Id;
  onChange: (selectedPaneId: Id) => void;
  tabs: ReadonlyArray<TabInfo<Id>>;
}

export interface TabInfo<Id extends string = string> {
  label: React.ReactNode;
  paneId: Id;
}

const Container = styled.div`
  border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem dotted
    ${(p) => p.theme.colors.foreground};
  display: flex;
  flex-direction: column;
  flex-shrink: 1;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem 0.75rem;
`;

const IconContainer = styled.span``;

interface TabLabelContainerProps {
  active?: boolean;
}

const TabLabelContainer = styled.span<TabLabelContainerProps>`
  align-items: center;
  display: flex;
  gap: 1rem;
  text-align: left;

  & ${IconContainer} {
    opacity: ${(p) => (p.active ? 1 : 0)};
    transition: opacity 100ms ease-out;
  }
`;

const TabLabel = styled.span`
  flex-grow: 1;
`;

/**
 * TODO: Not fully accessible yet - need to set tabIndex to -1 for all
 * unselected tabs and manually handle arrow keys cycling through the tabs.
 */
export function TabBar<Id extends string = string>(
  props: TabBarProps<Id>
): JSX.Element {
  const { activePaneId, onChange, tabs } = props;

  return (
    <Container
      aria-label="Display settings"
      aria-orientation="vertical"
      role="tablist"
    >
      {tabs.map(({ label, paneId }) => (
        <Button
          aria-controls={paneId}
          aria-selected={activePaneId === paneId}
          key={paneId}
          onPress={onChange}
          role="tab"
          value={paneId}
          variant={activePaneId === paneId ? 'primary' : 'regular'}
        >
          <TabLabelContainer active={activePaneId === paneId}>
            <TabLabel>{label}</TabLabel>
            <IconContainer>
              <Icons.RightChevron />
            </IconContainer>
          </TabLabelContainer>
        </Button>
      ))}
    </Container>
  );
}
