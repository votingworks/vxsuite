import React from 'react';
import { Meta } from '@storybook/react';

import { RadioGroup as Component, RadioGroupProps } from '.';

const initialArgs: Partial<RadioGroupProps<string>> = {
  label: 'Favourite Thing:',
  options: [
    { id: 'raindrops', label: 'Raindrops on roses' },
    { id: 'whiskers', label: 'Whiskers on kittens' },
    { id: 'kettles', label: 'Bright copper kettles' },
    { id: 'mittens', label: 'Warm woolen mittens' },
    { id: 'packages', label: 'Brown paper packages tied up with strings' },
  ],
  disabled: false,
};

const meta: Meta<typeof Component> = {
  title: 'libs-ui/RadioGroup',
  component: Component,
  args: initialArgs,
};

export default meta;

export function RadioGroup(props: RadioGroupProps<string>): JSX.Element {
  const { onChange } = props;
  const [selectedOptionId, setSelectedOptionId] = React.useState<string>('');

  function handleChange(id: string) {
    setSelectedOptionId(id);
    onChange(id);
  }

  return (
    <Component
      {...props}
      onChange={handleChange}
      selectedOptionId={selectedOptionId}
    />
  );
}
