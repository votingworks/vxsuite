/** Base URL of the app server that Playwright drives and posts API calls to. */
export const BASE_URL = 'http://127.0.0.1:3000';

/** Playwright output directory, relative to the integration-testing package. */
export const OUTPUT_DIR = './test-results';

/**
 * Directory where screenshots and PDF captures are written, and from which CI
 * publishes the screenshot gallery.
 */
export const SCREENSHOTS_DIR = `${OUTPUT_DIR}/screenshots`;
