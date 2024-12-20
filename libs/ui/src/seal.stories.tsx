import { Meta } from '@storybook/react';
import { readElectionGeneral } from '@votingworks/fixtures';

import { Seal, SealProps } from './seal';

const electionGeneral = readElectionGeneral();

const meta: Meta<typeof Seal> = {
  title: 'libs-ui/Seal',
  component: Seal,
};

export default meta;

export function seal(props: SealProps): JSX.Element {
  return <Seal {...props} seal={electionGeneral.seal} maxWidth="7rem" />;
}
