import { existsSync } from 'node:fs';

/**
 * This is where Chromium is installed if you run `sudo apt install chromium`.
 */
export const LINUX_DEFAULT_EXECUTABLE_PATH = '/usr/bin/chromium';

/**
 * Playwright normally installs Chromium to `~/.cache/ms-playwright`. We want
 * to use the system installed binary if it exists, because we may be running
 * in an offline environment where downloading via the Playwright path was not
 * possible.
 */
export const OPTIONAL_EXECUTABLE_PATH_OVERRIDE = existsSync(
  LINUX_DEFAULT_EXECUTABLE_PATH
)
  ? LINUX_DEFAULT_EXECUTABLE_PATH
  : undefined;
