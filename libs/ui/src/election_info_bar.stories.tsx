import { Meta } from '@storybook/react';

import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';

import { ElectionInfoBar, ElectionInfoBarProps } from './election_info_bar';

const initialArgs: ElectionInfoBarProps = {
  codeVersion: '00986543',
  electionDefinition: electionTwoPartyPrimaryDefinition,
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
};

export default meta;

export { ElectionInfoBar };
