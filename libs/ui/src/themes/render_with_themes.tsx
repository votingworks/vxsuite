import React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';

import { AppBase } from '../app_base';

function Wrapper(props: { children: React.ReactNode }): JSX.Element {
  return <AppBase {...props} />;
}

/**
 * React testing render function with UI theme support.
 * This is needed when rendering component trees that contain theme-dependent
 * components from libs/ui.
 */
export function renderWithThemes(
  ui: React.ReactElement,
  options: RenderOptions = {}
): RenderResult {
  return render(ui, { ...options, wrapper: Wrapper });
}
