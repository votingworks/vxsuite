import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import { LabelledText, LabelledTextProps } from './labelled_text.js';

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
