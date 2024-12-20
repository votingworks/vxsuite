import { Router } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { render, screen } from '../test/react_testing_library';
import { RouterTabBar } from './tabs';
import { makeTheme } from './themes/make_theme';

test('RouterTabBar navigates on click and shows active tab', () => {
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

  userEvent.click(screen.getByRole('tab', { name: 'Tab 2', selected: false }));

  tab1 = screen.getByRole('tab', { name: 'Tab 1', selected: false });
  tab2 = screen.getByRole('tab', { name: 'Tab 2', selected: true });
  expect(history.location.pathname).toEqual('/tab2');
  expect(tab1).toHaveStyle({ backgroundColor: theme.colors.container });
  expect(tab2).toHaveStyle({ backgroundColor: theme.colors.primaryContainer });
});
