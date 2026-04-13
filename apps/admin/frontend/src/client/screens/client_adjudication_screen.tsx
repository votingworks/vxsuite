import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { throwIllegalValue } from '@votingworks/basics';
import type { AdjudicationError } from '@votingworks/admin-backend';
import { Button, P } from '@votingworks/ui';
import { NavigationScreen } from '../../components/navigation_screen';
import { claimBallot, getAdjudicationSessionStatus } from '../api';
import { routerPaths } from '../../router_paths';

function claimErrorMessage(error: AdjudicationError): string {
  switch (error.type) {
    case 'no-claim':
      return 'Failed to claim a ballot. Please try again.';
    case 'host-disconnect':
      return 'Disconnected from host.';
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(error, 'type');
  }
}

export function ClientAdjudicationScreen(): JSX.Element {
  const history = useHistory();
  const adjudicationStatusQuery = getAdjudicationSessionStatus.useQuery();
  const { mutateAsync: claimBallotAsync } = claimBallot.useMutation();
  const [isClaiming, setIsClaiming] = useState(false);
  const [noBallots, setNoBallots] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const isAdjudicationEnabled =
    adjudicationStatusQuery.isSuccess &&
    adjudicationStatusQuery.data.isClientAdjudicationEnabled;

  async function handleStartAdjudication(): Promise<void> {
    setIsClaiming(true);
    setNoBallots(false);
    setErrorMessage(undefined);
    const result = await claimBallotAsync({});
    if (result.isErr()) {
      setIsClaiming(false);
      setErrorMessage(claimErrorMessage(result.err()));
      return;
    }
    const cvrId = result.ok();
    if (cvrId) {
      history.push(`${routerPaths.ballotAdjudication}/${cvrId}`);
    } else {
      setIsClaiming(false);
      setNoBallots(true);
    }
  }

  return (
    <NavigationScreen title="Adjudication">
      <P>
        <Button
          disabled={!isAdjudicationEnabled || isClaiming}
          onPress={handleStartAdjudication}
          variant="primary"
        >
          {isClaiming ? 'Claiming ballot…' : 'Start Adjudication'}
        </Button>
      </P>
      {!isAdjudicationEnabled && (
        <P>Waiting for host to initiate adjudication.</P>
      )}
      {noBallots && <P>No ballots available for adjudication.</P>}
      {errorMessage && <P>{errorMessage}</P>}
    </NavigationScreen>
  );
}
