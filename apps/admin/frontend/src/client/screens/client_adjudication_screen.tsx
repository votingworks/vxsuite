import { Button, H2, P } from '@votingworks/ui';
import { NavigationScreen } from '../../components/navigation_screen';
import { getAdjudicationSessionStatus } from '../api';

export function ClientAdjudicationScreen(): JSX.Element {
  const adjudicationStatusQuery = getAdjudicationSessionStatus.useQuery();
  const isAdjudicationEnabled =
    adjudicationStatusQuery.isSuccess &&
    adjudicationStatusQuery.data.isClientAdjudicationEnabled;
  return (
    <NavigationScreen title="Adjudication">
      <H2>Write-In Adjudication</H2>
      <P>
        <Button
          disabled={!isAdjudicationEnabled}
          onPress={
            /* istanbul ignore next - placeholder @preserve */
            () => {}
          }
        >
          Start Adjudication
        </Button>
      </P>
      <P>
        {!isAdjudicationEnabled && 'Waiting for host to initiate adjudication.'}
      </P>
    </NavigationScreen>
  );
}
