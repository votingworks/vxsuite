import { Button } from '@votingworks/ui';
import { LiveCheckButton } from '../components/live_check_button';
import { NavigationScreen } from '../components/navigation_screen';
import { switchToCentralScan } from '../api';

export function ElectionManagerSystemScreen(): JSX.Element {
  const switchToCentralScanMutation = switchToCentralScan.useMutation();

  return (
    <NavigationScreen title="System">
      <LiveCheckButton />
      <br />
      <br />
      <Button
        onPress={() => {
          switchToCentralScanMutation.mutate();
          window.kiosk?.quit();
        }}
      >
        Switch to VxCentralScan
      </Button>{' '}
    </NavigationScreen>
  );
}
