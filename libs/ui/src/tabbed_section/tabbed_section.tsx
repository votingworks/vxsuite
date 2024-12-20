import React from 'react';
import styled from 'styled-components';
import { TabBar, TabInfo } from './tab_bar';

export interface TabbedSectionProps<Id extends string = string> {
  ariaLabel: string;
  tabs: ReadonlyArray<TabConfig<Id>>;
}

export interface TabConfig<Id extends string = string> extends TabInfo<Id> {
  content: React.ReactNode;
}

const Container = styled.div`
  display: flex;
  flex-grow: 1;
  width: 100%;
`;

const Content = styled.div.attrs({ role: 'tabpanel' })`
  flex-grow: 1;
  padding: 0.25rem 0.5rem;
`;

export function TabbedSection<Id extends string = string>(
  props: TabbedSectionProps<Id>
): JSX.Element {
  const { ariaLabel, tabs } = props;

  const [activePaneId, setActivePaneId] = React.useState<Id>(tabs[0].paneId);

  const currentTab = tabs.find((t) => t.paneId === activePaneId);

  return (
    <Container>
      <TabBar
        activePaneId={activePaneId}
        aria-label={ariaLabel}
        onChange={setActivePaneId}
        tabs={tabs}
      />
      <Content id={currentTab?.paneId}>{currentTab?.content}</Content>
    </Container>
  );
}
