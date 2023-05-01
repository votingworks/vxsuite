import React from 'react';
import { useHistory } from 'react-router-dom';

import { DisplaySettings } from '@votingworks/ui';

export function DisplaySettingsScreen(): JSX.Element {
  const history = useHistory();

  return <DisplaySettings onClose={history.goBack} />;
}
