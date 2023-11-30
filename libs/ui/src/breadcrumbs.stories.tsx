import { Meta } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { BreadcrumbsProps, Breadcrumbs as Component } from './breadcrumbs';
import { H1 } from './typography';

const meta: Meta<typeof Component> = {
  title: 'libs-ui/Breadcrumbs',
  component: Component,
  args: {
    currentTitle: 'Child',
    parentRoutes: [
      { title: 'Grandparent', path: '/grandparent' },
      { title: 'Parent', path: '/grandparent/parent' },
    ],
  },
};

export default meta;

export function Breadcrumbs(props: BreadcrumbsProps): JSX.Element {
  return (
    <MemoryRouter>
      <div>
        <Component {...props} />
        <H1 style={{ margin: 0 }}>Child</H1>
      </div>
    </MemoryRouter>
  );
}
