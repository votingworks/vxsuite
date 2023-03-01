import React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';

import { ColorMode, SizeMode } from '@votingworks/types';
import { AppBase } from '../app_base';

type VxRenderOptions = RenderOptions & {
  vxTheme?: {
    colorMode?: ColorMode;
    sizeMode?: SizeMode;
  };
};

/**
 * React testing render function with UI theme support.
 * This is needed when rendering component trees that contain theme-dependent
 * components from libs/ui.
 */
export function renderWithThemes(
  ui: React.ReactElement,
  options: VxRenderOptions = {}
): RenderResult {
  const { vxTheme = {}, ...passthroughOptions } = options;

  return render(
    <AppBase colorMode={vxTheme.colorMode} sizeMode={vxTheme.sizeMode}>
      {ui}
    </AppBase>,
    { ...passthroughOptions }
  );
}
