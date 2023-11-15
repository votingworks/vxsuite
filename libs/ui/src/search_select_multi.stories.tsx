import { Meta } from '@storybook/react';

import { useState } from 'react';
import { SearchSelect, SearchSelectMultiProps } from './search_select';

const initialProps: SearchSelectMultiProps = {
  onChange: () => undefined,
  options: [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'orange', label: 'Orange' },
    { value: 'pear', label: 'Pear' },
    { value: 'strawberry', label: 'Strawberry' },
    { value: 'watermelon', label: 'Watermelon' },
    { value: 'grape', label: 'Grape' },
    { value: 'pineapple', label: 'Pineapple' },
    { value: 'kiwi', label: 'Kiwi' },
    { value: 'mango', label: 'Mango' },
    { value: 'peach', label: 'Peach' },
    { value: 'cherry', label: 'Cherry' },
    { value: 'blueberry', label: 'Blueberry' },
  ],
  value: [],
  isMulti: true,
  isSearchable: true,
  ariaLabel: 'Fruit Select',
  disabled: false,
};

const meta: Meta<typeof SearchSelect> = {
  title: 'libs-ui/SearchSelect',
  component: SearchSelect,
  args: initialProps,
  argTypes: {
    isMulti: {
      table: {
        disable: true,
      },
    },
  },
};

export default meta;

export function Multi(props: SearchSelectMultiProps): JSX.Element {
  const [value, setValue] = useState<string[]>([]);

  return (
    <SearchSelect
      style={{ minWidth: '8rem' }}
      {...props}
      value={value}
      onChange={setValue}
    />
  );
}
