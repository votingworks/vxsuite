import {
  renderWithThemes,
  VxRenderOptions,
  VxRenderResult,
} from '../src/themes/render_with_themes';

// Re-export all of @testing-library/react for convenience and override
// `render` as recommended at
// https://testing-library.com/docs/react-testing-library/setup/#custom-render
export * from '@testing-library/react';
export { renderWithThemes as render };
export type { VxRenderOptions as RenderOptions };
export type { VxRenderResult as RenderResult };
