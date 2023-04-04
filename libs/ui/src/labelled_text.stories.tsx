import { Meta } from '@storybook/react';

import { LabelledText, LabelledTextProps } from './labelled_text';

const initialArgs: LabelledTextProps = {
  children: 'Main text',
  label: 'Label',
  labelPosition: 'top',
};

const meta: Meta<typeof LabelledText> = {
  title: 'libs-ui/LabelledText',
  component: LabelledText,
  args: initialArgs,
};

export default meta;

export { LabelledText };
