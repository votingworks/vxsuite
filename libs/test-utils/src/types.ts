import { BoundFunctions, queries, RenderResult } from '@testing-library/react';

export type ReactTestingLibraryQueryable =
  | BoundFunctions<typeof queries>
  | RenderResult;
