import React from 'react';
import { mapObject } from '@votingworks/basics';
import { UiString } from '@votingworks/ui';
import { hmpbStringsCatalog } from '@votingworks/utils';

export const hmpbStrings = mapObject(hmpbStringsCatalog, (string, key) => (
  <UiString uiStringKey={key}>{string}</UiString>
)) as Record<keyof typeof hmpbStringsCatalog, JSX.Element>;
