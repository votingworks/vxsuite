import React from 'react';
import { Meta } from '@storybook/react';

import { RadioGroup as Component, RadioGroupProps } from '.';

const initialArgs: Partial<RadioGroupProps<string>> = {
  label: 'Favourite Thing:',
  options: [
    { value: 'raindrops', label: 'Raindrops on roses' },
    { value: 'whiskers', label: 'Whiskers on kittens' },
    { value: 'kettles', label: 'Bright copper kettles' },
    { value: 'mittens', label: 'Warm woolen mittens' },
    { value: 'packages', label: 'Brown paper packages tied up with strings' },
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
  const [value, setValue] = React.useState<string>('');

  function handleChange(val: string) {
    setValue(val);
    onChange(val);
  }

  return <Component {...props} onChange={handleChange} value={value} />;
}
