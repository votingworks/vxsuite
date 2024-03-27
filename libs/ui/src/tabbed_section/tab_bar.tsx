import React from 'react';
import styled from 'styled-components';
import { Button } from '../button';
import { IconName } from '../icons';

export interface TabBarProps<Id extends string = string> {
  activePaneId?: Id;
  onChange: (selectedPaneId: Id) => void;
  tabs: ReadonlyArray<TabInfo<Id>>;
}

export interface TabInfo<Id extends string = string> {
  label: React.ReactNode;
  icon?: IconName | JSX.Element;
  paneId: Id;
}

const Container = styled.div`
  border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem dotted
    ${(p) => p.theme.colors.onBackground};
  display: flex;
  flex-flow: column wrap;
  flex-shrink: 1;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem 0.75rem;
`;

const TabButton = styled(Button)<{ active?: boolean }>`
  justify-content: flex-start;
  flex-wrap: nowrap;
  white-space: nowrap;

  svg[data-icon='chevron-right'] {
    margin-left: auto;
    opacity: ${(p) => !p.active && '0'};
  }
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
      {tabs.map(({ label, icon, paneId }) => (
        <TabButton
          aria-controls={paneId}
          aria-selected={activePaneId === paneId}
          key={paneId}
          onPress={() => onChange(paneId)}
          role="tab"
          variant={activePaneId === paneId ? 'primary' : 'neutral'}
          icon={icon}
          rightIcon="ChevronRight"
          active={activePaneId === paneId}
        >
          {label}
        </TabButton>
      ))}
    </Container>
  );
}
