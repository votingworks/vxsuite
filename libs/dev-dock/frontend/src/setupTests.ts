import { afterEach, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

// eslint-disable-next-line vx/gts-direct-module-export-access-only
expect.extend(matchers);

afterEach(cleanup);
