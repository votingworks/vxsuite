import { Meta } from '@storybook/react';
import { safeParseElectionDefinition } from '@votingworks/types';
import electionTwoPartyPrimaryData from '@fixtures/electionTwoPartyPrimary/election.json?raw';
import { assertDefined } from '@votingworks/basics';
import { ElectionInfoBar, ElectionInfoBarProps } from './election_info_bar';

const electionTwoPartyPrimaryDefinition = safeParseElectionDefinition(
  electionTwoPartyPrimaryData
).unsafeUnwrap();

const { election } = electionTwoPartyPrimaryDefinition;
const pollingPlaces = assertDefined(election.pollingPlaces);

const initialArgs: ElectionInfoBarProps = {
  codeVersion: '00986543',
  electionDefinition: electionTwoPartyPrimaryDefinition,
  electionPackageHash: '11111111111111111111',
  machineId: '00123456',
  mode: 'admin',
  precinctSelection: {
    kind: 'AllPrecincts',
  },
};

const meta: Meta<typeof ElectionInfoBar> = {
  title: 'libs-ui/ElectionInfoBar',
  component: ElectionInfoBar,
  args: initialArgs,
  argTypes: {
    pollingPlaceId: {
      type: 'select',
      options: [undefined, ...pollingPlaces.map((p) => p.id)],
    },
  },
};

export default meta;

export { ElectionInfoBar };
