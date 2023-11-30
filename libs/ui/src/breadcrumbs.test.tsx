import { MemoryRouter } from 'react-router-dom';
import { Breadcrumbs } from './breadcrumbs';
import { render, screen } from '../test/react_testing_library';

describe('Breadcrumbs', () => {
  test('shows a sequence of links to the parent routes, plus the current title', () => {
    const { container } = render(
      <MemoryRouter>
        <Breadcrumbs
          currentTitle="Current Title"
          parentRoutes={[
            { title: 'Grandparent', path: '/grandparent' },
            { title: 'Parent', path: '/grandparent/parent' },
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Grandparent' })).toHaveAttribute(
      'href',
      '/grandparent'
    );
    expect(screen.getByRole('link', { name: 'Parent' })).toHaveAttribute(
      'href',
      '/grandparent/parent'
    );
    screen.getByText('Current Title');
    expect(container.firstChild).toHaveTextContent(
      'Grandparent / Parent / Current Title'
    );
  });
});
