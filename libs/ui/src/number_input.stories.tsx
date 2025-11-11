import { Meta } from '@storybook/react';
import { useEffect, useState } from 'react';

import {
  NumberInput as Component,
  NumberInputProps as Props,
} from './number_input';

const initialProps: Props = {
  id: 'number-input-story',
  value: 42,
  onChange: () => undefined,
  disabled: false,
};

const meta: Meta<typeof Component> = {
  title: 'libs-ui/NumberInput',
  component: Component,
  args: initialProps,
};

export default meta;

export function NumberInput(props: Props): JSX.Element {
  const { value: initialValue } = props;
  const [value, setValue] = useState<number | ''>(initialValue);

  // Sync with Storybook controls when props.value changes
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return <Component {...props} value={value} onChange={setValue} />;
}
