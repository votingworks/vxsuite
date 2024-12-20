import { UiTheme } from '@votingworks/types';
import React from 'react';
import { ThemeContext } from 'styled-components';

export function useCurrentTheme(): UiTheme {
  return React.useContext(ThemeContext);
}
