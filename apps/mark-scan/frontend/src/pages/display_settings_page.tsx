import { useHistory } from 'react-router-dom';

import { DisplaySettings } from '@votingworks/ui';

export function DisplaySettingsPage(): JSX.Element {
  const history = useHistory();

  return (
    <DisplaySettings onClose={history.goBack} allowAudioVideoOnlyToggles />
  );
}
