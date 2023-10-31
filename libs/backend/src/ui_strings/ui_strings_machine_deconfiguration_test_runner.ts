/* istanbul ignore file - test util */

import { LanguageCode } from '@votingworks/types';
import { UiStringsStore } from './ui_strings_store';

/** Test context for {@link runUiStringMachineDeconfigurationTests}. */
export interface UiStringDeconfigurationTestContext {
  runUnconfigureMachine(): void | Promise<void>;
  store: UiStringsStore;
}

/** Tests that all UI String data is cleared when unconfiguring a machine. */
export function runUiStringMachineDeconfigurationTests(
  context: UiStringDeconfigurationTestContext
): void {
  const { runUnconfigureMachine, store } = context;
  test('clears all UI String data from store', async () => {
    store.setUiStrings({
      languageCode: LanguageCode.ENGLISH,
      data: { foo: 'bar', deeply: { nested: 'value' } },
    });
    store.setUiStrings({
      languageCode: LanguageCode.SPANISH,
      data: { foo: 'bar_es', deeply: { nested: 'value_es' } },
    });
    store.setUiStringAudioIds({
      languageCode: LanguageCode.ENGLISH,
      data: { foo: ['123', 'abc'] },
    });

    await runUnconfigureMachine();

    expect(store.getLanguages()).toEqual([]);
    expect(store.getUiStrings(LanguageCode.ENGLISH)).toBeNull();
    expect(store.getUiStrings(LanguageCode.SPANISH)).toBeNull();
    expect(store.getUiStringAudioIds(LanguageCode.ENGLISH)).toBeNull();
  });
}
