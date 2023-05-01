/**
 * This file exists so that Cypress tests can import what they need without having to import all of
 * the auth lib. This ensures that we don't import packages that don't work in the browser. All of
 * this file's dependencies should accordingly contain only browser-safe code.
 *
 * Cypress tests should import from this file as follows:
 * ```
 * // eslint-disable-next-line vx/no-import-workspace-subfolders
 * import { ... } from '@votingworks/auth/src/cypress';
 * ```
 */

export { mockCard } from './mock_file_card';
export type { MockFileContents } from './mock_file_card';
