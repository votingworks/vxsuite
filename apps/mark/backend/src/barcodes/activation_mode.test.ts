import { expect, test } from 'vitest';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
} from '@votingworks/types';
import {
  isBarcodeBallotPrintingAllowed,
  resolveBarcodeActivationMode,
} from './activation_mode.js';

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

test('resolveBarcodeActivationMode', () => {
  expect(resolveBarcodeActivationMode('voter_session')).toEqual(
    'voter_session'
  );
  expect(resolveBarcodeActivationMode('ballot_printing')).toEqual(
    'voter_session'
  );
  expect(
    resolveBarcodeActivationMode('ballot_printing', PRINTING_ALLOWED)
  ).toEqual('ballot_printing');
  expect(
    resolveBarcodeActivationMode('voter_session', PRINTING_ALLOWED)
  ).toEqual('voter_session');
});
