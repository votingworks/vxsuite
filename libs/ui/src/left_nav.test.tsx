import { Link, Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import {
  AppLogo,
  LeftNav,
  NavDivider,
  NavLink,
  NavList,
  NavListItem,
} from './left_nav';
import { render, screen } from '../test/react_testing_library';

test('LeftNav renders a list of nav items in a sidebar', () => {
  const history = createMemoryHistory();
  render(
    <Router history={history}>
      <LeftNav>
        <Link to="/">
          <AppLogo appName="VxApp" />
        </Link>
        <NavList>
          <NavListItem>
            <NavLink to="/foo" isActive>
              Foo
            </NavLink>
          </NavListItem>
          <NavDivider />
          <NavListItem>
            <NavLink to="/bar" isActive={false}>
              Bar
            </NavLink>
          </NavListItem>
        </NavList>
      </LeftNav>
    </Router>
  );

  expect(history.location.pathname).toEqual('/');

  userEvent.click(screen.getByRole('button', { name: 'Foo' }));
  expect(history.location.pathname).toEqual('/foo');

  userEvent.click(screen.getByRole('button', { name: 'Bar' }));
  expect(history.location.pathname).toEqual('/bar');

  userEvent.click(screen.getByRole('link', { name: 'VxApp' }));
  expect(history.location.pathname).toEqual('/');
});
