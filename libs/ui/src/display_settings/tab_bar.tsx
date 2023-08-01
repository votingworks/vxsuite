import styled from 'styled-components';

import { PANE_IDS, SettingsPaneId } from './types';
import { Button } from '../button';

export interface TabBarProps {
  activePaneId: SettingsPaneId;
  className?: string;
  grow?: boolean;
  onChange: (selectedPaneId: SettingsPaneId) => void;
}

interface ContainerProps {
  grow?: boolean;
}

const Container = styled.div<ContainerProps>`
  display: flex;
  flex-grow: ${(p) => (p.grow ? 1 : 0)};
  flex-wrap: wrap;
  gap: max(0.25rem, ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px);

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
  displaySettingsColor: <span>Color</span>,
  displaySettingsSize: <span>Text Size</span>,
};

/**
 * TODO: Not fully accessible yet - need to set tabIndex to -1 for all
 * unselected tabs and manually handle arrow keys cycling through the tabs.
 */
export function TabBar(props: TabBarProps): JSX.Element {
  const { activePaneId, className, grow, onChange } = props;

  return (
    <Container
      aria-label="Display settings"
      className={className}
      grow={grow}
      role="tablist"
    >
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
