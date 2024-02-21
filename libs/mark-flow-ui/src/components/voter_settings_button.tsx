import { Button, appStrings } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { Paths } from '../config/globals';

export function VoterSettingsButton(): JSX.Element | null {
  const history = useHistory();

  return (
    <Button
      icon="Display"
      onPress={(target: string) => history.push(target)}
      value={Paths.VOTER_SETTINGS}
    >
      {appStrings.buttonVoterSettings()}
    </Button>
  );
}
