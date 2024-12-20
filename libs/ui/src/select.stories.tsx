import React from 'react';
import { Meta } from '@storybook/react';

import { Select, SelectProps } from './select';

const initialProps: SelectProps = {
  children: (
    <React.Fragment>
      <option value="all">All precincts</option>,
      <option value="west-hampshire">West Hampshire</option>,
      <option value="oldville-metro">Oldville Metro</option>,
      <option value="east-hometon">East Hometon</option>,
    </React.Fragment>
  ),
  large: true,
};

const meta: Meta<typeof Select> = {
  title: 'libs-ui/Select',
  component: Select,
  args: initialProps,
  argTypes: {
    onChange: {},
  },
};

export default meta;

export { Select };
