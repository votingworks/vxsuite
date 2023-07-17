import { LiveCheckButton } from '../components/live_check_button';
import { NavigationScreen } from '../components/navigation_screen';

export function ElectionManagerSystemScreen(): JSX.Element {
  return (
    <NavigationScreen title="System">
      <LiveCheckButton />{' '}
    </NavigationScreen>
  );
}
