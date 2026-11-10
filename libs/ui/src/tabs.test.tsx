import { expect, test } from 'vitest';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { userEvent } from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library.js';
import { RouterTabBar } from './tabs.js';
import { makeTheme } from './themes/make_theme.js';

test('RouterTabBar navigates on click and shows active tab', async () => {
  const history = createMemoryHistory({ initialEntries: ['/tab1'] });
  const tabs = [
    { title: 'Tab 1', path: '/tab1' },
    { title: 'Tab 2', path: '/tab2' },
  ];
  const theme = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
  render(
    <Router history={history}>
      <RouterTabBar tabs={tabs} />
    </Router>,
    { vxTheme: theme }
  );
  let tab1 = screen.getByRole('tab', { name: 'Tab 1', selected: true });
  let tab2 = screen.getByRole('tab', { name: 'Tab 2', selected: false });
  expect(tab1).toHaveStyle({ backgroundColor: theme.colors.primaryContainer });
  expect(tab2).toHaveStyle({ backgroundColor: theme.colors.container });

  await userEvent.click(
    screen.getByRole('tab', { name: 'Tab 2', selected: false })
  );

  tab1 = screen.getByRole('tab', { name: 'Tab 1', selected: false });
  tab2 = screen.getByRole('tab', { name: 'Tab 2', selected: true });
  expect(history.location.pathname).toEqual('/tab2');
  expect(tab1).toHaveStyle({ backgroundColor: theme.colors.container });
  expect(tab2).toHaveStyle({ backgroundColor: theme.colors.primaryContainer });
});

test('RouterTabBar shows a tab as active on nested paths', () => {
  const history = createMemoryHistory({ initialEntries: ['/tab1/edit'] });
  const tabs = [
    { title: 'Tab 1', path: '/tab1' },
    { title: 'Tab 2', path: '/tab2' },
  ];
  render(
    <Router history={history}>
      <RouterTabBar tabs={tabs} />
    </Router>
  );
  screen.getByRole('tab', { name: 'Tab 1', selected: true });
  screen.getByRole('tab', { name: 'Tab 2', selected: false });
});

test('RouterTabBar does not show a tab as active on a longer sibling path', () => {
  const history = createMemoryHistory({ initialEntries: ['/tab10'] });
  const tabs = [
    { title: 'Tab 1', path: '/tab1' },
    { title: 'Tab 10', path: '/tab10' },
  ];
  render(
    <Router history={history}>
      <RouterTabBar tabs={tabs} />
    </Router>
  );
  screen.getByRole('tab', { name: 'Tab 1', selected: false });
  screen.getByRole('tab', { name: 'Tab 10', selected: true });
});
