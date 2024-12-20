import { Meta } from '@storybook/react';

import { Callout as Component, CalloutProps as Props } from './callout';

const initialProps: Props = {
  icon: 'Info',
  children: 'This is a callout',
};

const meta: Meta<typeof Component> = {
  title: 'libs-ui/Callout',
  component: Component,
  args: initialProps,
};

export default meta;

export function Callout(props: Props): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Component {...props} color={undefined} />
      <Component {...props} color="primary" />
      <Component {...props} color="warning" />
      <Component {...props} color="danger" />
    </div>
  );
}
