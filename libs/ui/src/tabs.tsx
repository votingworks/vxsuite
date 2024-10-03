import styled from 'styled-components';
import { useHistory, useLocation } from 'react-router-dom';
import { Button, ButtonProps } from './button';

const StyledTabButton = styled(Button)`
  min-width: 8rem;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom-width: 0;
` as <T>(props: ButtonProps<T>) => JSX.Element;

type TabButtonProps<T> = ButtonProps<T> & { isActive: boolean };

function TabButton<T>({ isActive, ...props }: TabButtonProps<T>): JSX.Element {
  return (
    <StyledTabButton
      role="tab"
      fill="tinted"
      color={isActive ? 'primary' : 'neutral'}
      aria-selected={isActive}
      {...props}
    />
  );
}

const TabBar = styled.div.attrs({ role: 'tablist' })`
  display: flex;
  gap: 0.5rem;
  border-bottom: ${(p) =>
    `${p.theme.sizes.bordersRem.medium}rem solid ${p.theme.colors.outline}`};
`;

export interface RouterTabBarProps {
  tabs: Array<{ title: string; path: string }>;
}

/**
 * A tab bar component that uses react-router to navigate between tabs. Given a
 * list of tab definitions (`title` and `path`), it renders a tab bar with
 * buttons that navigate to the corresponding paths and highlights the active tab.
 *
 * To render the tab content, use the {@link TabPanel} component inside a `Switch`.
 */
export function RouterTabBar({ tabs }: RouterTabBarProps): JSX.Element {
  const location = useLocation();
  const history = useHistory();
  return (
    <TabBar>
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <TabButton
            key={tab.path}
            isActive={isActive}
            onPress={() => history.push(tab.path)}
          >
            {tab.title}
          </TabButton>
        );
      })}
    </TabBar>
  );
}

export const TabPanel = styled.section.attrs({ role: 'tabpanel' })`
  padding: 1rem 0;
`;
