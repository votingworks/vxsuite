import { useState } from 'react';
import { Meta } from '@storybook/react';
import {
  CheckboxButtonProps,
  CheckboxButton as Component,
} from './checkbox_button';

const meta: Meta<typeof Component> = {
  title: 'libs-ui/CheckboxButton',
  component: Component,
  args: {
    label: 'Is this checked?',
  },
};

export default meta;

export function CheckboxButton(props: CheckboxButtonProps): JSX.Element {
  const { onChange } = props;
  const [isChecked, setIsChecked] = useState(false);

  function handleChange(val: boolean) {
    setIsChecked(val);
    onChange(val);
  }

  return <Component {...props} isChecked={isChecked} onChange={handleChange} />;
}
