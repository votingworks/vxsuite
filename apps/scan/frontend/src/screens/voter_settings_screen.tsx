import { useHistory } from 'react-router-dom';

import { VoterSettings } from '@votingworks/ui';

export function VoterSettingsScreen(): JSX.Element {
  const history = useHistory();

  return <VoterSettings onClose={history.goBack} />;
}
