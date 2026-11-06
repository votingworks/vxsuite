import { expect, test } from 'vitest';
import { unsafeParse } from '@votingworks/types';
import {
  getStateFeaturesConfig,
  StateCodeSchema,
  stateFeatureConfigs,
} from './state_features.js';

test('StateCodeSchema', () => {
  expect(unsafeParse(StateCodeSchema, 'DEMO')).toEqual('DEMO');
  expect(() => unsafeParse(StateCodeSchema, 'XX')).toThrow();
});

test('getStateFeaturesConfig', () => {
  expect(getStateFeaturesConfig({ stateCode: 'NH' })).toEqual(
    stateFeatureConfigs.NH
  );
});
