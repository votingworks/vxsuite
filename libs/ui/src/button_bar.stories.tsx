import React from 'react';
import { Meta } from '@storybook/react';

import { ButtonBar as Component } from './button_bar';
import { Button } from './button';
import { P } from './typography';

const meta: Meta<typeof Component> = {
  title: 'libs-ui/ButtonBar',
  component: Component,
};

export default meta;

export function ButtonBar(): JSX.Element {
  const [lastButtonPressed, setLastButtonPressed] = React.useState<string>('');

  return (
    <div>
      <P>Last button pressed: {lastButtonPressed}</P>
      <Component>
        <Button
          variant="primary"
          onPress={setLastButtonPressed}
          value="Button A"
        >
          Button A
        </Button>
        <Button onPress={setLastButtonPressed} value="Button B">
          Button B
        </Button>
        <Button onPress={setLastButtonPressed} value="Button C">
          Button C
        </Button>
      </Component>
    </div>
  );
}
