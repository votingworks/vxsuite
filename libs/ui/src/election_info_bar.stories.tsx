import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};
import { safeParseElection } from '@votingworks/types';
import electionTwoPartyPrimaryData from '@fixtures/electionTwoPartyPrimary/election.json?raw';
import { assertDefined } from '@votingworks/basics';
import {
  ElectionInfoBar,
  type ElectionInfoBarProps,
} from './election_info_bar.js';

const election = safeParseElection(electionTwoPartyPrimaryData).unsafeUnwrap();
const pollingPlaces = assertDefined(election.pollingPlaces);

const initialArgs: ElectionInfoBarProps = {
  codeVersion: '00986543',
  electionDefinition: {
    ballotHash: 'cafef00d',
    election,
    electionData: '',
  },
  electionPackageHash: '11111111111111111111',
  machineId: '00123456',
  mode: 'admin',
};

const meta: Meta<typeof ElectionInfoBar> = {
  title: 'libs-ui/ElectionInfoBar',
  component: ElectionInfoBar,
  args: initialArgs,
  argTypes: {
    pollingPlaceId: {
      control: 'select',
      options: [undefined, ...pollingPlaces.map((p) => p.id)],
    },
  },
};

export default meta;

export { ElectionInfoBar };
