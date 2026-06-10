/** Base URL of the app server that Playwright drives and posts API calls to. */
export const BASE_URL = 'http://127.0.0.1:3000';

/** Playwright output directory, relative to the integration-testing package. */
export const OUTPUT_DIR = './test-results';

/**
 * Directory where screenshots and PDF captures are written, and from which CI
 * publishes the screenshot gallery.
 */
export const SCREENSHOTS_DIR = `${OUTPUT_DIR}/screenshots`;

/**
 * Browser viewport matching the HP EliteBook's display, the desktop hardware
 * VxAdmin, VxCentralScan, and VxPrint run on. Shared so their screenshots stay
 * consistent.
 */
export const HP_ELITEBOOK_VIEWPORT = { width: 1920, height: 1200 } as const;
