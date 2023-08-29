import { Button } from '@votingworks/ui';
import styled from 'styled-components';
import { useHistory, useLocation } from 'react-router-dom';
import { Row } from './layout';

interface Tab {
  label: string;
  path: string;
}

interface TabBarProps {
  tabs: Tab[];
}

const TabRow = styled(Row)`
  gap: 0.5rem;
  border-bottom: 2px solid ${({ theme }) => theme.colors.foreground};
`;

const TabButton = styled(Button)<{ isActive: boolean }>`
  min-width: 8rem;
  border-radius: 0.25rem 0.25rem 0 0;
  border-bottom-width: 0;
  background: ${({ isActive }) => (isActive ? '' : 'none')};
`;

export function TabBar({ tabs }: TabBarProps): JSX.Element {
  const location = useLocation();
  const history = useHistory();
  return (
    <TabRow role="tablist">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <TabButton
            key={tab.path}
            isActive={isActive}
            onPress={() => history.push(tab.path)}
            role="tab"
            aria-selected={isActive}
          >
            {tab.label}
          </TabButton>
        );
      })}
    </TabRow>
  );
}

export const TabPanel = styled.section.attrs({ role: 'tabpanel' })`
  padding: 1rem 0;
`;
