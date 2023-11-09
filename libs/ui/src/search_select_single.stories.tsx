import { Meta } from '@storybook/react';

import { useState } from 'react';
import { SearchSelect, SearchSelectSingleProps } from './search_select';

const initialProps: SearchSelectSingleProps = {
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
  value: undefined,
  isMulti: false,
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

export function Single(props: SearchSelectSingleProps): JSX.Element {
  const [value, setValue] = useState<string>();

  return (
    <SearchSelect
      style={{ minWidth: '8rem' }}
      {...props}
      value={value}
      onChange={setValue}
    />
  );
}
