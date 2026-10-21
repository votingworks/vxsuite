import { expect, test } from 'vitest';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
} from '@votingworks/types';
import { isBarcodeBallotPrintingAllowed } from './activation_mode.js';

const PRINTING_ALLOWED: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  allowPrintingBlankBallotsFromVxMark: true,
};

test('isBarcodeBallotPrintingAllowed', () => {
  expect(isBarcodeBallotPrintingAllowed()).toEqual(false);
  expect(isBarcodeBallotPrintingAllowed(DEFAULT_SYSTEM_SETTINGS)).toEqual(
    false
  );
  expect(isBarcodeBallotPrintingAllowed(PRINTING_ALLOWED)).toEqual(true);
});
