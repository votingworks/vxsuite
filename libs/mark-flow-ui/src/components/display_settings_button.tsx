import { Button, appStrings } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { Paths } from '../config/globals';

export function DisplaySettingsButton(): JSX.Element | null {
  const history = useHistory();

  return (
    <Button
      icon="Display"
      onPress={(target: string) => history.push(target)}
      value={Paths.DISPLAY_SETTINGS}
    >
      {/* TODO(kofi): Update app string to "Settings". */}
      {appStrings.buttonDisplaySettings()}
    </Button>
  );
}
