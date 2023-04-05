import { Meta } from '@storybook/react';

import { BigMetric, BigMetricProps } from './big_metric';

const initialArgs: BigMetricProps = {
  label: 'Ballots Scanned',
  value: 4506,
};

const meta: Meta<typeof BigMetric> = {
  title: 'libs-ui/BigMetric',
  component: BigMetric,
  args: initialArgs,
};

export default meta;

export { BigMetric };
