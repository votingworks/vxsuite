/* istanbul ignore file - test util @preserve */

import type * as vitest from 'vitest';
import { UiStringsStore } from './ui_strings_store';

/** Test context for {@link runUiStringMachineDeconfigurationTests}. */
export interface UiStringDeconfigurationTestContext {
  runUnconfigureMachine(): void | Promise<void>;
  store: UiStringsStore;
  expect: typeof vitest.expect;
  test: typeof vitest.test;
}

/** Tests that all UI String data is cleared when unconfiguring a machine. */
export function runUiStringMachineDeconfigurationTests(
  context: UiStringDeconfigurationTestContext
): void {
  const { runUnconfigureMachine, store, expect, test } = context;
  test('clears all UI String data from store', async () => {
    store.setUiStrings({
      languageCode: 'en',
      data: { foo: 'bar', deeply: { nested: 'value' } },
    });
    store.setUiStrings({
      languageCode: 'es-US',
      data: { foo: 'bar_es', deeply: { nested: 'value_es' } },
    });
    store.setUiStringAudioIds({
      languageCode: 'en',
      data: { foo: ['123', 'abc'] },
    });
    store.setAudioClip({
      dataBase64: 'ABC==',
      id: 'abc',
      languageCode: 'en',
    });

    await runUnconfigureMachine();

    expect(store.getLanguages()).toEqual([]);
    expect(store.getUiStrings('en')).toBeNull();
    expect(store.getUiStrings('es-US')).toBeNull();
    expect(store.getUiStringAudioIds('en')).toBeNull();
    expect(
      store.getAudioClips({
        audioIds: ['abc'],
        languageCode: 'en',
      })
    ).toEqual([]);
  });
}
