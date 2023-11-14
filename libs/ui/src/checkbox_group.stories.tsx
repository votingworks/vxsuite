import { useState } from 'react';
import { Meta } from '@storybook/react';
import {
  CheckboxGroupProps,
  CheckboxGroup as Component,
} from './checkbox_group';

const meta: Meta<typeof Component> = {
  title: 'libs-ui/CheckboxGroup',
  component: Component,
  args: {
    label: 'Favorite Things:',
    options: [
      { value: 'raindrops', label: 'Raindrops on roses' },
      { value: 'whiskers', label: 'Whiskers on kittens' },
      { value: 'kettles', label: 'Bright copper kettles' },
      { value: 'mittens', label: 'Warm woolen mittens' },
      { value: 'packages', label: 'Brown paper packages tied up with strings' },
    ],
  },
};

export default meta;

export function CheckboxGroup(props: CheckboxGroupProps): JSX.Element {
  const { onChange } = props;
  const [value, setValue] = useState<string[]>([]);

  function handleChange(val: string[]) {
    setValue(val);
    onChange(val);
  }

  return <Component {...props} value={value} onChange={handleChange} />;
}
