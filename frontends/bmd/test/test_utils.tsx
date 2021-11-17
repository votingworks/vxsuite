import { createMemoryHistory, History } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { render as testRender } from '@testing-library/react';
import {
  BallotStyleId,
  Contests,
  ElectionDefinition,
  parseElection,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import { asElectionDefinition } from '@votingworks/fixtures';

import * as GLOBALS from '../src/config/globals';

// it's necessary to use the no-seal version, which has neither
// of the two optional seal fields, because otherwise
// typescript concludes that sealURL is required.
import electionSampleNoSeal from '../src/data/electionSampleNoSeal.json';

import {
  MachineConfig,
  MarkVoterCardFunction,
  Printer,
  TextSizeSetting,
  VxMarkOnly,
} from '../src/config/types';

import { BallotContext } from '../src/contexts/ballot_context';
import { fakePrinter } from './helpers/fake_printer';
import { fakeMachineConfig } from './helpers/fake_machine_config';

export function render(
  component: React.ReactNode,
  {
    route = '/',
    ballotStyleId,
    electionDefinition = asElectionDefinition(
      parseElection(electionSampleNoSeal)
    ),
    contests = electionDefinition.election.contests,
    markVoterCardVoided = jest.fn(),
    markVoterCardPrinted = jest.fn(),
    history = createMemoryHistory({ initialEntries: [route] }),
    isCardlessVoter = false,
    isLiveMode = false,
    machineConfig = fakeMachineConfig({ appMode: VxMarkOnly }),
    precinctId,
    printer = fakePrinter(),
    resetBallot = jest.fn(),
    setUserSettings = jest.fn(),
    updateTally = jest.fn(),
    updateVote = jest.fn(),
    forceSaveVote = jest.fn(),
    userSettings = { textSize: GLOBALS.TEXT_SIZE as TextSizeSetting },
    votes = {},
  }: {
    route?: string;
    ballotStyleId?: BallotStyleId;
    electionDefinition?: ElectionDefinition;
    contests?: Contests;
    markVoterCardVoided?: MarkVoterCardFunction;
    markVoterCardPrinted?: MarkVoterCardFunction;
    history?: History;
    isCardlessVoter?: boolean;
    isLiveMode?: boolean;
    machineConfig?: MachineConfig;
    precinctId?: PrecinctId;
    printer?: Printer;
    resetBallot?(): void;
    setUserSettings?(): void;
    updateTally?(): void;
    updateVote?(): void;
    forceSaveVote?(): void;
    userSettings?: { textSize: TextSizeSetting };
    votes?: VotesDict;
  } = {}
): ReturnType<typeof testRender> {
  return {
    ...testRender(
      <BallotContext.Provider
        value={{
          ballotStyleId,
          contests,
          electionDefinition,
          isCardlessVoter,
          isLiveMode,
          machineConfig,
          markVoterCardVoided,
          markVoterCardPrinted,
          precinctId,
          printer,
          resetBallot,
          setUserSettings,
          updateTally,
          updateVote,
          forceSaveVote,
          userSettings,
          votes,
        }}
      >
        <Router history={history}>{component}</Router>
      </BallotContext.Provider>
    ),
  };
}
