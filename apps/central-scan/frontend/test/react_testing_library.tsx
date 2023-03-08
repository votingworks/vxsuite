import {
  renderWithThemes,
  VxRenderOptions,
  VxRenderResult,
  vxTestingLibraryScreen,
  vxTestingLibraryWithinFn,
} from '@votingworks/ui';

// Re-export all of @testing-library/react for convenience and override
// with customized VX utils and types, as recommended at
// https://testing-library.com/docs/react-testing-library/setup/#custom-render
export * from '@testing-library/react';
export { renderWithThemes as render };
export { vxTestingLibraryScreen as screen };
export { vxTestingLibraryWithinFn as within };
export type { VxRenderOptions as RenderOptions };
export type { VxRenderResult as RenderResult };
