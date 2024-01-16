import { LanguageCode } from '@votingworks/types';
import { H1 } from '..';
import {
  act,
  render as renderWithoutContext,
  screen,
} from '../../test/react_testing_library';
import { newTestContext } from '../../test/test_context';
import { NumberString } from './number_string';

test('formats based on current language code', async () => {
  const { getLanguageContext, mockBackendApi, render } = newTestContext();

  mockBackendApi.getAvailableLanguages.mockResolvedValue([]);
  mockBackendApi.getUiStrings.mockResolvedValue({});

  render(
    <H1>
      <NumberString value={100000} />
    </H1>
  );

  await screen.findByRole('heading', { name: '100,000' });

  // Force-cast a non-Vx language to test locale-specific formatting:
  act(() => getLanguageContext()?.setLanguage('es-ES' as LanguageCode));

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
