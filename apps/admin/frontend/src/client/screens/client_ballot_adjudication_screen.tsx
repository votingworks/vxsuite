import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Loading, Main, P, Screen } from '@votingworks/ui';
import { useHistory, useParams } from 'react-router-dom';
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
    case 'no-claim':
      return 'This machine no longer has an active claim on this ballot. Please try again.';
    case 'host-disconnect':
      return 'Disconnected from host.';
    default:
      /* istanbul ignore next - @preserve */
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
  // The cvrId is absent when arriving from "Start Adjudication" (claim the
  // next available ballot) and present on refresh/direct navigation (reclaim
  // that specific ballot).
  const { cvrId: initialCvrId } = useParams<{ cvrId?: string }>();
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

  // Initial load: claim+load a ballot — the specific one named in the URL, or
  // the next available one when no cvrId is present. Runs once on mount; the ref guard makes the claim fire at
  // most once even under StrictMode's double-invoke. We `history.replace` the
  // resolved cvrId into the URL so a refresh reclaims the same ballot.
  const hasClaimedOnMountRef = useRef(false);
  useEffect(() => {
    if (hasClaimedOnMountRef.current) return;
    hasClaimedOnMountRef.current = true;
    void (async () => {
      const result = await claimAndLoadAsync(
        initialCvrId ? { cvrId: initialCvrId } : {}
      );
      if (result.isErr()) {
        setFlowState({ type: 'error', error: result.err() });
        return;
      }
      const value = result.ok();
      if (!value) {
        setFlowState({ type: 'done' });
        return;
      }
      // Only rewrite the URL when we arrived without a cvrId (from "Start
      // Adjudication"); when one is already present the path is correct and
      // replacing it could clobber a concurrent redirect.
      if (!initialCvrId) {
        history.replace(`${routerPaths.ballotAdjudication}/${value.cvrId}`);
      }
      setFlowState({
        type: 'adjudicating',
        cvrId: value.cvrId,
        data: value.data,
      });
    })();
  }, [claimAndLoadAsync, history, initialCvrId]);

  // Move forward past `afterCvrId` to the next eligible ballot. With no
  // argument, restarts from the beginning of the queue (used as the
  // wrap-around fallback when we've walked past the end mid-session).
  const claimNextBallot = useCallback(
    async (afterCvrId?: Id): Promise<void> => {
      let result = await claimAndLoadAsync(afterCvrId ? { afterCvrId } : {});

      // If nothing is available past `afterCvrId`, try once more without
      // the cursor — there may be still-unresolved ballots earlier in the
      // queue that we walked past via Skip.
      if (result.isOk() && !result.ok() && afterCvrId) {
        result = await claimAndLoadAsync({});
      }

      if (result.isErr()) {
        setFlowState({ type: 'error', error: result.err() });
        return;
      }

      const value = result.ok();
      if (value) {
        history.replace(`${routerPaths.ballotAdjudication}/${value.cvrId}`);
        setFlowState({
          type: 'adjudicating',
          cvrId: value.cvrId,
          data: value.data,
        });
      } else {
        setFlowState({ type: 'done' });
      }
    },
    [claimAndLoadAsync, history]
  );

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
      /* istanbul ignore next - @preserve */
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
  const writeInCandidatesQuery = getWriteInCandidates.useQuery();
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

  // Auxiliary proxy results may still surface their own errors.
  const proxyError =
    mutationError ??
    [ballotImages, writeInCandidates].find((r) => r.isErr())?.err();
  if (proxyError) {
    return (
      <NavigationScreen title="Adjudication">
        <P>{proxyErrorMessage(proxyError)}</P>
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
