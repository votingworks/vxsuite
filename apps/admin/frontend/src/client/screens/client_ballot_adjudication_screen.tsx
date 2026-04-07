import { useCallback, useRef, useState } from 'react';
import { Button, Loading, Main, P, Screen } from '@votingworks/ui';
import { useHistory, useParams } from 'react-router-dom';
import { throwIllegalValue } from '@votingworks/basics';
import { Id } from '@votingworks/types';
import { BallotAdjudicationScreen } from '../../screens/ballot_adjudication_screen';
import { NavigationScreen } from '../../components/navigation_screen';
import { routerPaths } from '../../router_paths';
import {
  adjudicateCvrContest,
  claimBallot,
  getBallotAdjudicationData,
  getBallotImages,
  getSystemSettings,
  getWriteInCandidates,
  releaseBallot,
  resolveBallotTags,
} from '../api';

type FlowState =
  | { type: 'adjudicating'; cvrId: Id }
  | { type: 'claiming' }
  | { type: 'done' };

export function ClientBallotAdjudicationScreen(): JSX.Element {
  const history = useHistory();
  const { cvrId: initialCvrId } = useParams<{ cvrId: string }>();
  const { mutateAsync: claimBallotAsync } = claimBallot.useMutation();
  const { mutateAsync: releaseBallotAsync } = releaseBallot.useMutation();
  const [flowState, setFlowState] = useState<FlowState>({
    type: 'adjudicating',
    cvrId: initialCvrId,
  });
  const skippedCvrIdsRef = useRef<Set<Id>>(new Set());

  const releaseClaim = useCallback(
    async (cvrId: Id): Promise<void> => {
      try {
        void (await releaseBallotAsync({ cvrId }));
      } catch {
        // Best-effort release
      }
    },
    [releaseBallotAsync]
  );

  const claimNextBallot = useCallback(async (): Promise<void> => {
    setFlowState({ type: 'claiming' });

    try {
      const excludeCvrIds = [...skippedCvrIdsRef.current];
      let cvrId = await claimBallotAsync(
        excludeCvrIds.length > 0 ? { excludeCvrIds } : {}
      );

      if (!cvrId && excludeCvrIds.length > 0) {
        skippedCvrIdsRef.current.clear();
        cvrId = await claimBallotAsync({});
      }

      if (cvrId) {
        setFlowState({ type: 'adjudicating', cvrId });
      } else {
        setFlowState({ type: 'done' });
      }
    } catch {
      /* istanbul ignore next - auth logs user out before this fires @preserve */
      setFlowState({ type: 'done' });
    }
  }, [claimBallotAsync]);

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

    case 'done':
      return (
        <NavigationScreen title="Adjudication">
          <P>No more ballots available for adjudication.</P>
          <P>
            <Button onPress={() => history.push(routerPaths.adjudication)}>
              Back to Adjudication
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

/**
 * Fetches adjudication data from the client proxy and renders
 * BallotAdjudicationScreen. If the host disconnects, the backend clears the
 * cached election which triggers an auth state change that logs the user out
 * before any query error reaches the UI.
 */
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
  const adjudicationDataQuery = getBallotAdjudicationData.useQuery(cvrId);
  const ballotImagesQuery = getBallotImages.useQuery(cvrId);
  const writeInCandidatesQuery = getWriteInCandidates.useQuery();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const { mutateAsync: resolveTagsAsync } = resolveBallotTags.useMutation();
  const { mutateAsync: adjudicateContestAsync } =
    adjudicateCvrContest.useMutation();

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

  return (
    <BallotAdjudicationScreen
      cvrId={cvrId}
      ballotAdjudicationData={adjudicationDataQuery.data}
      ballotImages={ballotImagesQuery.data}
      writeInCandidates={writeInCandidatesQuery.data}
      systemSettings={systemSettingsQuery.data}
      onResolveBallotTags={() => resolveTagsAsync({ cvrId })}
      onAdjudicateCvrContest={adjudicateContestAsync}
      onAcceptDone={onAcceptDone}
      onSkip={onSkip}
      onExit={onExit}
    />
  );
}
