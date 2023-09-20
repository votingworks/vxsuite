/* istanbul ignore file - test util */

import { UiStringsApi } from '@votingworks/types';

/** Returns a new mock {@link UiStringsApi}. */
export function createUiStringsApiMock(): UiStringsApi {
  return {
    getAudioClipsBase64: jest.fn(),
    getAvailableLanguages: jest.fn(),
    getUiStringAudioKeys: jest.fn(),
    getUiStrings: jest.fn(),
  };
}
