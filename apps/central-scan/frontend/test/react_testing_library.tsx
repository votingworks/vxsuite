import React from 'react';
import {
  makeRender,
  VxRenderOptions,
  VxRenderResult,
  vxTestingLibraryScreen,
  vxTestingLibraryWithinFn,
} from '@votingworks/ui';
import { onTestFinished } from 'vitest';

// Re-export all of @testing-library/react for convenience and override
// with customized VX utils and types, as recommended at
// https://testing-library.com/docs/react-testing-library/setup/#custom-render
export * from '@testing-library/react';

// makeRender's defaults are for voter-facing apps; override to match
// VxCentralScan's desktop production theme.
const baseRender = makeRender(onTestFinished);
export function render(
  ui: React.ReactElement,
  options: VxRenderOptions = {}
): VxRenderResult {
  return baseRender(ui, {
    ...options,
    vxTheme: {
      colorMode: 'desktop',
      sizeMode: 'desktop',
      ...(options.vxTheme ?? {}),
    },
  });
}

export { vxTestingLibraryScreen as screen };
export { vxTestingLibraryWithinFn as within };
export type { VxRenderOptions as RenderOptions };
export type { VxRenderResult as RenderResult };
