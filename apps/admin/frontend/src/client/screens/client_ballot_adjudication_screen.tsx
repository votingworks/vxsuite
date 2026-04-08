import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Loading, Main, P, Screen } from '@votingworks/ui';
import { useHistory, useParams } from 'react-router-dom';
import { throwIllegalValue } from '@votingworks/basics';
import { Id } from '@votingworks/types';
import type { AdjudicationError } from '@votingworks/admin-backend';
import { BallotAdjudicationScreen } from '../../screens/ballot_adjudication_screen';
import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import {
  adjudicateCvrContest,
  claimBallot,
  getAdjudicationSessionStatus,
  getBallotAdjudicationData,
  getBallotImages,
  getSystemSettings,
  getWriteInCandidates,
  releaseBallot,
  setCvrResolved,
} from '../api';

function proxyErrorMessage(error: AdjudicationError): string {
  switch (error.type) {
    case 'no-claim':
      return 'This machine no longer has an active claim on this ballot. Please try again.';
    case 'host-disconnect':
      return 'Disconnected from host.';
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(error, 'type');
  }
}

type FlowState =
  | { type: 'adjudicating'; cvrId: Id }
  | { type: 'claiming' }
  | { type: 'done' }
  | { type: 'error'; error: AdjudicationError };

export function ClientBallotAdjudicationScreen(): JSX.Element {
  const history = useHistory();
  const { cvrId: initialCvrId } = useParams<{ cvrId: string }>();
  const adjudicationStatusQuery = getAdjudicationSessionStatus.useQuery();
  const { mutateAsync: claimBallotAsync } = claimBallot.useMutation();
  const { mutateAsync: releaseBallotAsync } = releaseBallot.useMutation();
  const [flowState, setFlowState] = useState<FlowState>({
    type: 'adjudicating',
    cvrId: initialCvrId,
  });
  const skippedCvrIdsRef = useRef<Set<Id>>(new Set());

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

  const claimNextBallot = useCallback(async (): Promise<void> => {
    setFlowState({ type: 'claiming' });

    const excludeCvrIds = [...skippedCvrIdsRef.current];
    let result = await claimBallotAsync(
      excludeCvrIds.length > 0 ? { excludeCvrIds } : {}
    );

    if (result.isOk() && !result.ok() && excludeCvrIds.length > 0) {
      skippedCvrIdsRef.current.clear();
      result = await claimBallotAsync({});
    }

    if (result.isErr()) {
      setFlowState({ type: 'error', error: result.err() });
      return;
    }

    const cvrId = result.ok();
    if (cvrId) {
      history.replace(`${routerPaths.ballotAdjudication}/${cvrId}`);
      setFlowState({ type: 'adjudicating', cvrId });
    } else {
      setFlowState({ type: 'done' });
    }
  }, [claimBallotAsync, history]);

  const skipBallot = useCallback(
    async (cvrId: Id): Promise<void> => {
      skippedCvrIdsRef.current.add(cvrId);
      await releaseClaim(cvrId);
      await claimNextBallot();
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
    case 'claiming':
      return (
        <Screen>
          <Main flexRow>
            <Loading>Claiming next ballot…</Loading>
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
          onAcceptDone={() => void claimNextBallot()}
          onSkip={() => void skipBallot(flowState.cvrId)}
          onExit={() => void exitBallot(flowState.cvrId)}
        />
      );

    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(flowState);
  }
}

function ClientBallotAdjudicationDataLoader({
  cvrId,
  onAcceptDone,
  onSkip,
  onExit,
}: {
  cvrId: Id;
  onAcceptDone: () => void;
  onSkip: () => void;
  onExit: () => void;
}): JSX.Element {
  const history = useHistory();
  const adjudicationDataQuery = getBallotAdjudicationData.useQuery(cvrId);
  const ballotImagesQuery = getBallotImages.useQuery(cvrId);
  const writeInCandidatesQuery = getWriteInCandidates.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const { mutateAsync: setCvrResolvedAsync } = setCvrResolved.useMutation();
  const { mutateAsync: adjudicateContestAsync } =
    adjudicateCvrContest.useMutation();
  const [mutationError, setMutationError] = useState<AdjudicationError>();

  if (
    !adjudicationDataQuery.isSuccess ||
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

  const adjudicationData = adjudicationDataQuery.data;
  const ballotImages = ballotImagesQuery.data;
  const writeInCandidates = writeInCandidatesQuery.data;
  const systemSettings = systemSettingsQuery.data;

  // Check for proxy errors in query results or mutations
  const proxyError =
    mutationError ??
    [adjudicationData, ballotImages, writeInCandidates]
      .find((r) => r.isErr())
      ?.err();
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

  // Unwrap ok values — systemSettings is not a Result (it reads from cache).
  // We've already checked for errors above, so unsafeUnwrap is safe here.
  const adjData = adjudicationData.unsafeUnwrap();
  const images = ballotImages.unsafeUnwrap();
  const candidates = writeInCandidates.unsafeUnwrap();

  return (
    <BallotAdjudicationScreen
      cvrId={cvrId}
      ballotAdjudicationData={adjData}
      ballotImages={images}
      writeInCandidates={candidates}
      systemSettings={systemSettings}
      onSetCvrResolved={async () => {
        const result = await setCvrResolvedAsync({ cvrId });
        if (result.isErr()) {
          setMutationError(result.err());
          throw new Error(result.err().type);
        }
      }}
      onAdjudicateCvrContest={async (input) => {
        const result = await adjudicateContestAsync(input);
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
