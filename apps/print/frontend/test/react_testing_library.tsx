import {
  makeRender,
  VxRenderOptions,
  VxRenderResult,
  vxTestingLibraryScreen,
  vxTestingLibraryWithinFn,
} from '@votingworks/ui';
import { onTestFinished } from 'vitest';

export * from '@testing-library/react';
export const render = makeRender(onTestFinished);
export { vxTestingLibraryScreen as screen };
export { vxTestingLibraryWithinFn as within };
export type { VxRenderOptions as RenderOptions };
export type { VxRenderResult as RenderResult };
