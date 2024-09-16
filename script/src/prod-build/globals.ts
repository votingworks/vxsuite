import { isAbsolute, join } from 'node:path';

export const WORKSPACE_ROOT = join(__dirname, '../../..');
export const BUILD_ROOT = ((envBuildRoot?: string) =>
  envBuildRoot
    ? isAbsolute(envBuildRoot)
      ? envBuildRoot
      : join(process.cwd(), envBuildRoot)
    : join(WORKSPACE_ROOT, 'build'))(process.env['BUILD_ROOT']);
export const PNPM_LOGLEVEL = 'error';
