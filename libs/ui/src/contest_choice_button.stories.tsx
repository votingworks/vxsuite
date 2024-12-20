import React from 'react';
import { Meta } from '@storybook/react';

import {
  ContestChoiceButton as Component,
  ContestChoiceButtonProps as Props,
} from './contest_choice_button';

const initialProps: Props = {
  onPress: () => undefined,
  label: 'Thomas Edison',
  caption: 'Republican',
  choice: 'edison',
};

const meta: Meta<typeof Component> = {
  title: 'libs-ui/ContestChoiceButton',
  component: Component,
  args: initialProps,
};

export default meta;

export function ContestChoiceButton(props: Props): JSX.Element {
  const [isSelected, setIsSelected] = React.useState<boolean>(false);

  return (
    <Component
      {...props}
      isSelected={isSelected}
      onPress={() => setIsSelected(!isSelected)}
    />
  );
}
