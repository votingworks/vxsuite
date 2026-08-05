import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import { BigMetric, BigMetricProps } from './big_metric.js';

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
