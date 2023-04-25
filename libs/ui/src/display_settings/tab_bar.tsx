/* stylelint-disable order/properties-order */
import React from 'react';
import styled from 'styled-components';

import { PANE_IDS, SettingsPaneId } from './types';
import { Icons } from '../icons';
import { Button } from '../button';

export interface TabBarProps {
  activePaneId: SettingsPaneId;
  onChange: (selectedPaneId: SettingsPaneId) => void;
}

const Container = styled.div`
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem dotted
    ${(p) => p.theme.colors.foreground};
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem 0.75rem;

  & > * {
    max-width: ${100 / PANE_IDS.length}%;
    min-width: min-content;
  }
`;

const TabLabel = styled.span`
  align-items: center;
  display: flex;
  gap: 0.4rem;
  text-align: left;
`;

const TAB_LABELS: Record<SettingsPaneId, JSX.Element> = {
  displaySettingsColor: (
    <React.Fragment>
      <Icons.Contrast /> <span>Color</span>
    </React.Fragment>
  ),
  displaySettingsSize: (
    <React.Fragment>
      <Icons.TextSize /> <span>Text Size</span>
    </React.Fragment>
  ),
};

/**
 * TODO: Not fully accessible yet - need to set tabIndex to -1 for all
 * unselected tabs and manually handle arrow keys cycling through the tabs.
 */
export function TabBar(props: TabBarProps): JSX.Element {
  const { activePaneId, onChange } = props;

  return (
    <Container aria-label="Display settings" role="tablist">
      {[...PANE_IDS].map((paneId) => (
        <Button
          aria-controls={paneId}
          aria-selected={activePaneId === paneId}
          key={paneId}
          onPress={onChange}
          role="tab"
          value={paneId}
          variant={activePaneId === paneId ? 'primary' : 'regular'}
        >
          <TabLabel>{TAB_LABELS[paneId]}</TabLabel>
        </Button>
      ))}
    </Container>
  );
}
