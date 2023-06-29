import { Meta } from '@storybook/react';

import { Seal, SealProps } from './seal';

const meta: Meta<typeof Seal> = {
  title: 'libs-ui/Seal',
  component: Seal,
};

export default meta;

export function seal(props: SealProps): JSX.Element {
  return <Seal {...props} sealUrl="seals/Sample-Seal.svg" />;
}
