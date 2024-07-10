import React from 'react';
import {
  CastBallotPage,
  ContestsWithMsEitherNeither,
  MachineConfig,
  UpdateVoteFunction,
} from '@votingworks/mark-flow-ui';
import { randomBallotId } from '@votingworks/utils';
import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import type { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import {
  MarkScanControllerSandbox,
  PatDeviceContextProvider,
  useAccessibleControllerHelpTrigger,
} from '@votingworks/ui';
import { Ballot } from './components/ballot';
import { ValidateBallotPage } from './pages/validate_ballot_page';
import { BallotContext } from './contexts/ballot_context';
import * as api from './api';
import { PatDeviceCalibrationPage } from './pages/pat_device_identification/pat_device_calibration_page';
import { ReinsertedInvalidBallotScreen } from './pages/reinserted_invalid_ballot_screen';
import { WaitingForBallotReinsertionBallotScreen } from './pages/waiting_for_ballot_reinsertion_screen';
import { LoadingReinsertedBallotScreen } from './pages/loading_reinserted_ballot_screen';

export interface VoterFlowProps {
  contests: ContestsWithMsEitherNeither;
  electionDefinition: ElectionDefinition;
  machineConfig: MachineConfig;
  precinctId?: PrecinctId;
  ballotStyleId?: BallotStyleId;
  isLiveMode: boolean;
  updateVote: UpdateVoteFunction;
  resetBallot: (showPostVotingInstructions?: boolean) => void;
  endVoterSession: () => Promise<void>;
  stateMachineState: SimpleServerStatus;
  votes: VotesDict;
}

export function VoterFlow(props: VoterFlowProps): React.ReactNode {
  const { resetBallot, stateMachineState, ...rest } = props;

  const confirmSessionEndMutation = api.confirmSessionEnd.useMutation();
  const isPathDeviceConnected =
    api.getIsPatDeviceConnected.useQuery().data || false;

  const { shouldShowControllerSandbox } = useAccessibleControllerHelpTrigger();

  if (stateMachineState === 'pat_device_connected') {
    return <PatDeviceCalibrationPage />;
  }

  if (shouldShowControllerSandbox) {
    return <MarkScanControllerSandbox />;
  }

  let ballotContextProviderChild = <Ballot />;

  // Pages that condition on state machine state aren't nested under Ballot because Ballot uses
  // frontend browser routing for flow control and is completely independent of the state machine.
  // We still want to nest some pages that condition on the state machine under BallotContext so we render them here.
  if (stateMachineState === 'presenting_ballot') {
    ballotContextProviderChild = <ValidateBallotPage />;
  }

  if (stateMachineState === 'ballot_removed_during_presentation') {
    return (
      <CastBallotPage
        hidePostVotingInstructions={() => {
          resetBallot();
          confirmSessionEndMutation.mutate();
        }}
        printingCompleted
      />
    );
  }

  if (stateMachineState === 'waiting_for_ballot_reinsertion') {
    return <WaitingForBallotReinsertionBallotScreen />;
  }

  if (
    stateMachineState === 'loading_reinserted_ballot' ||
    stateMachineState === 'validating_reinserted_ballot'
  ) {
    return <LoadingReinsertedBallotScreen />;
  }

  if (stateMachineState === 'reinserted_invalid_ballot') {
    return <ReinsertedInvalidBallotScreen />;
  }

  return (
    <BallotContext.Provider
      value={{
        ...rest,
        generateBallotId: randomBallotId,
        isCardlessVoter: true,
        resetBallot,
      }}
    >
      <PatDeviceContextProvider isPatDeviceConnected={isPathDeviceConnected}>
        {ballotContextProviderChild}
      </PatDeviceContextProvider>
    </BallotContext.Provider>
  );
}
