import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Button, H2, P } from '@votingworks/ui';
import { NavigationScreen } from '../../components/navigation_screen';
import { claimBallot, getAdjudicationSessionStatus } from '../api';
import { routerPaths } from '../../router_paths';

export function ClientAdjudicationScreen(): JSX.Element {
  const history = useHistory();
  const adjudicationStatusQuery = getAdjudicationSessionStatus.useQuery();
  const { mutateAsync: claimBallotAsync } = claimBallot.useMutation();
  const [isClaiming, setIsClaiming] = useState(false);

  const isAdjudicationEnabled =
    adjudicationStatusQuery.isSuccess &&
    adjudicationStatusQuery.data.isClientAdjudicationEnabled;

  async function handleStartAdjudication(): Promise<void> {
    setIsClaiming(true);
    try {
      const cvrId = await claimBallotAsync({});
      if (cvrId) {
        history.push(`${routerPaths.ballotAdjudication}/${cvrId}`);
      } else {
        setIsClaiming(false);
      }
    } catch {
      /* istanbul ignore next - auth logs user out on disconnect @preserve */
      setIsClaiming(false);
    }
  }

  return (
    <NavigationScreen title="Adjudication">
      <H2>Write-In Adjudication</H2>
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
    </NavigationScreen>
  );
}
