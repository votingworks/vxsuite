import { Meta } from '@storybook/react';
import electionGeneralData from '@fixtures/electionGeneral/election.json?raw';
import { safeParseElection } from '@votingworks/types';
import { Seal, SealProps } from './seal';

const electionGeneral = safeParseElection(electionGeneralData).unsafeUnwrap();

const meta: Meta<typeof Seal> = {
  title: 'libs-ui/Seal',
  component: Seal,
};

export default meta;

export function seal(props: SealProps): JSX.Element {
  return <Seal {...props} seal={electionGeneral.seal} maxWidth="7rem" />;
}
