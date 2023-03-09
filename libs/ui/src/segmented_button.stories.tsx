import React from 'react';
import { Meta } from '@storybook/react';

import {
  SegmentedButton as Component,
  SegmentedButtonOptionId,
  SegmentedButtonProps,
} from './segmented_button';
import { Caption, P } from './typography';

const initialProps: SegmentedButtonProps<string> = {
  onChange: () => undefined,
  options: [
    {
      id: 'A',
      label: 'Option A',
    },
    {
      id: 'B',
      label: 'Option B',
    },
    {
      id: 'C',
      label: 'Option C',
    },
    {
      id: 'D',
      label: 'Option D',
    },
  ],
};

const meta: Meta<typeof Component> = {
  title: 'Molecules/SegmentedButton',
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
    React.useState<SegmentedButtonOptionId>('D');

  return (
    <div>
      <P>
        <Component
          {...props}
          onChange={setSelectedOptionId}
          selectedOptionId={selectedOptionId}
        />
      </P>
      <Caption>Option {selectedOptionId} selected!</Caption>
    </div>
  );
}
