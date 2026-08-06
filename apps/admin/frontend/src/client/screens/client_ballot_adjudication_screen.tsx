import { useCallback, useEffect, useState } from 'react';
import { Button, Loading, Main, P, Screen } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { throwIllegalValue } from '@votingworks/basics';
import { Id } from '@votingworks/types';
import type {
  AdjudicationError,
  BallotAdjudicationData,
} from '@votingworks/admin-backend';
import { BallotAdjudicationScreen } from '../../screens/ballot_adjudication_screen';
import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import {
  adjudicateCvr,
  claimAndLoadBallot,
  getAdjudicationSessionStatus,
  getBallotImages,
  getSystemSettings,
  getWriteInCandidates,
  releaseBallot,
} from '../api';

function proxyErrorMessage(error: AdjudicationError): string {
  switch (error.type) {
    case 'claim-failed':
      return 'This machine no longer has an active claim on this ballot. Please try again.';
    case 'host-disconnect':
      return 'Disconnected from host.';
    case 'adjudication-disabled':
      return 'Adjudication is not currently enabled on the host machine.';
    default:
      throwIllegalValue(error, 'type');
  }
}

// While claiming the next ballot, we stay on the previous `adjudicating`
// state so the user keeps seeing the old ballot rather than a Loading
// flicker. `initial-load` is only used on first mount, before we've ever
// successfully claimed.
type FlowState =
  | { type: 'initial-load' }
  | { type: 'adjudicating'; cvrId: Id; data: BallotAdjudicationData }
  | { type: 'done' }
  | { type: 'error'; error: AdjudicationError };

export function ClientBallotAdjudicationScreen(): JSX.Element {
  const history = useHistory();
  const adjudicationStatusQuery = getAdjudicationSessionStatus.useQuery();
  const { mutateAsync: claimAndLoadAsync } = claimAndLoadBallot.useMutation();
  const { mutateAsync: releaseBallotAsync } = releaseBallot.useMutation();

  const [flowState, setFlowState] = useState<FlowState>({
    type: 'initial-load',
  });

  // Navigate back if the host disables adjudication mid-session
  const isAdjudicationEnabled =
    adjudicationStatusQuery.data?.isClientAdjudicationEnabled ?? true;
  useEffect(() => {
    if (!isAdjudicationEnabled) {
      history.push(routerPaths.adjudication);
    }
  }, [isAdjudicationEnabled, history]);

  const releaseClaim = useCallback(
    async (cvrId: Id): Promise<void> => {
      void (await releaseBallotAsync({ cvrId }));
    },
    [releaseBallotAsync]
  );

  // Claim+load a ballot and reflect it in flow state. `afterCvrId` advances to
  // the next eligible ballot, which the backend wraps around the end of the
  // queue back to any earlier still-unresolved ballots; with no argument it
  // claims a fresh ballot (used for the initial mount).
  const claimNextBallot = useCallback(
    async (afterCvrId?: Id): Promise<void> => {
      const result = await claimAndLoadAsync(afterCvrId ? { afterCvrId } : {});
      if (result.isErr()) {
        setFlowState({ type: 'error', error: result.err() });
        return;
      }

      const value = result.ok();
      if (value) {
        setFlowState({
          type: 'adjudicating',
          cvrId: value.cvrId,
          data: value.data,
        });
      } else {
        setFlowState({ type: 'done' });
      }
    },
    [claimAndLoadAsync]
  );

  // Claim the first ballot on mount (no cursor → a fresh claim).
  useEffect(() => {
    void claimNextBallot();
  }, [claimNextBallot]);

  const skipBallot = useCallback(
    async (cvrId: Id): Promise<void> => {
      await releaseClaim(cvrId);
      await claimNextBallot(cvrId);
    },
    [releaseClaim, claimNextBallot]
  );

  const exitBallot = useCallback(
    async (cvrId: Id): Promise<void> => {
      await releaseClaim(cvrId);
      history.push(routerPaths.adjudication);
    },
    [releaseClaim, history]
  );

  switch (flowState.type) {
    case 'initial-load':
      return (
        <Screen>
          <Main flexRow>
            <Loading isFullscreen />
          </Main>
        </Screen>
      );

    case 'error':
      return (
        <NavigationScreen title="Adjudication">
          <P>{proxyErrorMessage(flowState.error)}</P>
          {/* @coverage-defer */}
          <Button onPress={() => history.push(routerPaths.adjudication)}>
            Exit
          </Button>
        </NavigationScreen>
      );

    case 'done':
      return (
        <NavigationScreen title="Adjudication">
          <P>No more ballots available for adjudication.</P>
          <P>
            <Button onPress={() => history.push(routerPaths.adjudication)}>
              Exit
            </Button>
          </P>
        </NavigationScreen>
      );

    case 'adjudicating':
      return (
        <ClientBallotAdjudicationDataLoader
          cvrId={flowState.cvrId}
          ballotData={flowState.data}
          onAcceptDone={() => void claimNextBallot(flowState.cvrId)}
          onSkip={() => void skipBallot(flowState.cvrId)}
          onExit={() => void exitBallot(flowState.cvrId)}
        />
      );

    default:
      throwIllegalValue(flowState);
  }
}

function ClientBallotAdjudicationDataLoader({
  cvrId,
  ballotData,
  onAcceptDone,
  onSkip,
  onExit,
}: {
  cvrId: Id;
  ballotData: BallotAdjudicationData;
  onAcceptDone: () => void;
  onSkip: () => void;
  onExit: () => void;
}): JSX.Element {
  const history = useHistory();
  const ballotImagesQuery = getBallotImages.useQuery(cvrId);
  const writeInCandidatesQuery = getWriteInCandidates.useQuery(
    // @coverage-defer
    ballotData.contests.map((c) => c.contestId)
  );
  const systemSettingsQuery = getSystemSettings.useQuery();
  const { mutateAsync: adjudicateCvrAsync } = adjudicateCvr.useMutation();
  const [mutationError, setMutationError] = useState<AdjudicationError>();

  if (
    !ballotImagesQuery.isSuccess ||
    !writeInCandidatesQuery.isSuccess ||
    !systemSettingsQuery.isSuccess
  ) {
    return (
      <Screen>
        <Main flexRow>
          <Loading isFullscreen />
        </Main>
      </Screen>
    );
  }

  const ballotImages = ballotImagesQuery.data;
  const writeInCandidates = writeInCandidatesQuery.data;
  const systemSettings = systemSettingsQuery.data;

  // Check for proxy errors in query results or mutations.
  const proxyError =
    mutationError ??
    [ballotImages, writeInCandidates].find((r) => r.isErr())?.err();
  if (proxyError) {
    return (
      <NavigationScreen title="Adjudication">
        <P>{proxyErrorMessage(proxyError)}</P>
        {/* @coverage-defer */}
        <Button onPress={() => history.push(routerPaths.adjudication)}>
          Exit
        </Button>
      </NavigationScreen>
    );
  }

  const images = ballotImages.unsafeUnwrap();
  const candidates = writeInCandidates.unsafeUnwrap();

  return (
    <BallotAdjudicationScreen
      key={cvrId}
      cvrId={cvrId}
      ballotAdjudicationData={ballotData}
      ballotImages={images}
      writeInCandidates={candidates}
      systemSettings={systemSettings}
      onAccept={async (input) => {
        const result = await adjudicateCvrAsync(input);
        if (result.isErr()) {
          setMutationError(result.err());
          throw new Error(result.err().type);
        }
      }}
      onAcceptDone={onAcceptDone}
      onSkip={onSkip}
      onExit={onExit}
    />
  );
}
