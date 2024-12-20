import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { H1, TestErrorBoundary } from '..';
import {
  act,
  render as renderWithoutContext,
  screen,
} from '../../test/react_testing_library';
import { newTestContext } from '../../test/test_context';
import { NumberString } from './number_string';
import { UiStringAudioDataAttributeName } from './with_audio';

test('formats based on current language code', async () => {
  const { getLanguageContext, mockApiClient, render } = newTestContext({
    uiStringsApiOptions: { noAudio: true },
  });

  mockApiClient.getAvailableLanguages.mockResolvedValue([]);
  mockApiClient.getUiStrings.mockResolvedValue({});

  render(
    <H1>
      <NumberString value={100000} />
    </H1>
  );

  await screen.findByRole('heading', { name: '100,000' });

  // Force-cast a non-Vx language to test locale-specific formatting:
  act(() => getLanguageContext()?.setLanguage('es-ES'));

  await screen.findByRole('heading', { name: '100.000' });
});

test('uses default language code with language context', async () => {
  renderWithoutContext(
    <H1>
      <NumberString value={100000} />
    </H1>
  );

  await screen.findByRole('heading', { name: '100,000' });
});

test('renders with audio data attributes', async () => {
  const { I18N_KEY, LANGUAGE_CODE } = UiStringAudioDataAttributeName;
  const { render } = newTestContext();

  render(<NumberString value={23} />);

  const element = await screen.findByText('23');
  expect(element).toHaveAttribute(I18N_KEY, `number23`);
  expect(element).toHaveAttribute(LANGUAGE_CODE, 'en');
});

test('throws on unsupported number in audio context', async () => {
  const { render } = newTestContext();

  await suppressingConsoleOutput(async () => {
    render(
      <TestErrorBoundary>
        <NumberString value={9999} />
      </TestErrorBoundary>
    );

    await screen.findByText(/test error boundary/i);
    screen.getByText(/no audio available/i);
  });
});
