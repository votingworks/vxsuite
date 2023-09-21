import { LanguageCode } from '@votingworks/types';
import { mockOf } from '@votingworks/test-utils';
import { createUiStringsApiMock } from '@votingworks/backend';

import { withApp } from '../test/helpers/custom_helpers';

const mockUiStringsApi = createUiStringsApiMock();
jest.mock('@votingworks/backend', (): typeof import('@votingworks/backend') => {
  return {
    ...jest.requireActual('@votingworks/backend'),
    createUiStringsApi: () => mockUiStringsApi,
  };
});

test('installs UI Strings API', async () => {
  await withApp({}, async ({ apiClient }) => {
    mockOf(mockUiStringsApi.getAvailableLanguages).mockImplementation(() => [
      LanguageCode.CHINESE,
    ]);
    await expect(apiClient.getAvailableLanguages()).resolves.toEqual([
      LanguageCode.CHINESE,
    ]);

    mockOf(mockUiStringsApi.getUiStrings).mockImplementation(() => ({
      foo: 'bar',
    }));
    await expect(
      apiClient.getUiStrings({ languageCode: LanguageCode.SPANISH })
    ).resolves.toEqual({
      foo: 'bar',
    });

    mockOf(mockUiStringsApi.getUiStringAudioKeys).mockImplementation(() => ({
      foo: ['123', '456'],
    }));
    await expect(
      apiClient.getUiStringAudioKeys({ languageCode: LanguageCode.SPANISH })
    ).resolves.toEqual({
      foo: ['123', '456'],
    });

    mockOf(mockUiStringsApi.getAudioClipsBase64).mockImplementation(() => ({
      abc: 'data-abc',
    }));
    await expect(
      apiClient.getAudioClipsBase64({
        languageCode: LanguageCode.ENGLISH,
        audioKeys: ['abc'],
      })
    ).resolves.toEqual({ abc: 'data-abc' });
  });
});
