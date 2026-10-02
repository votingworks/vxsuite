import { expect, test } from 'vitest';
import { BLOCKING_PRINTER_STATE_REASONS } from '@votingworks/ui';
import { BLOCKING_PRINTER_STATE_REASON_LABELS } from './toolbar.js';

test('every blocking printer state reason has a toolbar label', () => {
  for (const reason of BLOCKING_PRINTER_STATE_REASONS) {
    expect(BLOCKING_PRINTER_STATE_REASON_LABELS[reason]).toBeDefined();
  }
});
