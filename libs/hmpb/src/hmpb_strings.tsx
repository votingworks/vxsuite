import React from 'react';
import { mapObject } from '@votingworks/basics';
import { UiString } from '@votingworks/ui';

// We want `hmpbStringsCatalog`, but not the rest of `@votingworks/backend`
// because this file is loaded in the browser and trying to load the backend
// code causes all sorts of problems. See `vite.config.ts` for the alias that
// makes this work properly.
// eslint-disable-next-line vx/no-import-workspace-subfolders
import { hmpbStringsCatalog } from '@votingworks/backend/src/language_and_audio/hmpb_strings';

export const hmpbStrings = mapObject(hmpbStringsCatalog, (string, key) => (
  <UiString uiStringKey={key}>{string}</UiString>
)) as Record<keyof typeof hmpbStringsCatalog, JSX.Element>;
