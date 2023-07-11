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
  border-bottom: 2px solid ${({ theme }) => theme.colors.accentPrimary};
`;

const TabButton = styled(Button)`
  min-width: 8rem;
  text-align: left;
  border-radius: 0.25rem 0.25rem 0 0;
  border-bottom-width: 0;
  span {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
`;

export function TabBar({ tabs }: TabBarProps): JSX.Element {
  const location = useLocation();
  const history = useHistory();
  return (
    <TabRow>
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <TabButton
            key={tab.path}
            variant={isActive ? 'primary' : undefined}
            onPress={() => history.push(tab.path)}
          >
            {tab.label}
          </TabButton>
        );
      })}
    </TabRow>
  );
}

export const TabPanel = styled.section`
  padding: 1rem 0;
`;
