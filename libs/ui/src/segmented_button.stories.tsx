import React from 'react';
import { Meta } from '@storybook/react';

import {
  SegmentedButton as Component,
  SegmentedButtonOptionId,
  SegmentedButtonProps,
} from './segmented_button';

const initialProps: SegmentedButtonProps<string> = {
  label: 'Ballot Mode:',
  onChange: () => undefined,
  options: [
    {
      id: 'official',
      label: 'Official',
      ariaLabel: 'Enable official ballot mode',
    },
    {
      id: 'test',
      label: 'Test',
    },
    {
      id: 'sample',
      label: 'Sample',
    },
  ],
};

const meta: Meta<typeof Component> = {
  title: 'libs-ui/SegmentedButton',
  component: Component,
  args: initialProps,
  argTypes: {
    onChange: {},
  },
};

export default meta;

export function SegmentedButton(
  props: SegmentedButtonProps<string>
): JSX.Element {
  const [selectedOptionId, setSelectedOptionId] =
    React.useState<SegmentedButtonOptionId>('test');

  return (
    <Component
      {...props}
      onChange={setSelectedOptionId}
      selectedOptionId={selectedOptionId}
    />
  );
}
