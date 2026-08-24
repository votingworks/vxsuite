import React from 'react';
import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import {
  ContestChoiceButton as Component,
  ContestChoiceButtonProps as Props,
} from './contest_choice_button';

const initialProps: Props<string> = {
  onPress: () => undefined,
  label: 'Thomas Edison',
  caption: 'Republican',
  choice: 'edison',
};

const meta: Meta<Props<string>> = {
  title: 'libs-ui/ContestChoiceButton',
  component: Component,
  args: initialProps,
};

export default meta;

export function ContestChoiceButton(props: Props<string>): JSX.Element {
  const [isSelected, setIsSelected] = React.useState<boolean>(false);

  return (
    <Component
      {...props}
      isSelected={isSelected}
      onPress={() => setIsSelected(!isSelected)}
    />
  );
}
