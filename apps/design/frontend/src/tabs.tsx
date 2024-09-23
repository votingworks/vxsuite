import { Button, Route } from '@votingworks/ui';
import styled from 'styled-components';
import { useHistory, useLocation } from 'react-router-dom';
import { Row } from './layout';

type Tab = Route;

interface TabBarProps {
  tabs: Tab[];
}

const TabRow = styled(Row)`
  gap: 0.5rem;
  border-bottom: ${(p) =>
    `${p.theme.sizes.bordersRem.medium}rem solid ${p.theme.colors.outline}`};
`;

const TabButton = styled(Button)`
  min-width: 8rem;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
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
            fill="tinted"
            color={isActive ? 'primary' : 'neutral'}
            onPress={() => history.push(tab.path)}
            role="tab"
            aria-selected={isActive}
          >
            {tab.title}
          </TabButton>
        );
      })}
    </TabRow>
  );
}

export const TabPanel = styled.section.attrs({ role: 'tabpanel' })`
  padding: 1rem 0;
`;
