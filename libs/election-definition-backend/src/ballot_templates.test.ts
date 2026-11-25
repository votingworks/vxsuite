import { expect, test } from 'vitest';
import { defaultBallotTemplate } from './ballot_templates.js';

test('defaultBallotTemplate', () => {
  expect(defaultBallotTemplate('DEMO')).toEqual('VxDefaultBallot');
  expect(defaultBallotTemplate('MI')).toEqual('MiBallot');
  expect(defaultBallotTemplate('MS')).toEqual('MsBallot');
  expect(defaultBallotTemplate('NH')).toEqual('NhBallot');
});
