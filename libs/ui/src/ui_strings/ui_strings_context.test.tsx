import { screen, waitFor } from '../../test/react_testing_library';
import { newTestContext } from '../../test/test_context';

test('includes both language and audio contexts', async () => {
  const { getAudioContext, getLanguageContext, mockApiClient, render } =
    newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue(['en']);
  mockApiClient.getUiStrings.mockResolvedValue(null);

  render(<div>foo</div>);

  await waitFor(() => expect(getLanguageContext()).toBeDefined());
  expect(getAudioContext()).toBeDefined();
});

test('skips audio context when `noAudio` is true', async () => {
  const { getAudioContext, getLanguageContext, mockApiClient, render } =
    newTestContext({ uiStringsApiOptions: { noAudio: true } });
  mockApiClient.getAvailableLanguages.mockResolvedValue(['en']);
  mockApiClient.getUiStrings.mockResolvedValue(null);

  render(<div>foo</div>);
  await waitFor(() => expect(getLanguageContext()).toBeDefined());
  expect(getAudioContext()).toBeUndefined();
});

test('omits both contexts when `disableForTesting` is true', async () => {
  const { getAudioContext, getLanguageContext, mockApiClient, render } =
    newTestContext({ uiStringsApiOptions: { disabled: true } });

  mockApiClient.getAvailableLanguages.mockResolvedValue(['en']);

  mockApiClient.getUiStrings.mockResolvedValue(null);

  render(<div>foo</div>);

  await screen.findByText('foo');
  expect(getLanguageContext()).toBeUndefined();
  expect(getAudioContext()).toBeUndefined();
});
