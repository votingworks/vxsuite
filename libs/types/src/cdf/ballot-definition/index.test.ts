import { buildSchema } from '@votingworks/cdf-schema-builder';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BallotDefinitionSchema } from '.';
import { mockWritable } from '../../../test/helpers/mock_writable';
import { testCdfBallotDefinition } from './convert.test';

test('BallotDefinition', () => {
  BallotDefinitionSchema.parse(testCdfBallotDefinition);
});

test('schema in sync', () => {
  const xsd = readFileSync(
    join(__dirname, '../../../data/cdf/ballot-definition/schema.xsd'),
    'utf-8'
  );
  const json = readFileSync(
    join(__dirname, '../../../data/cdf/ballot-definition/schema.json'),
    'utf-8'
  );
  const currentOutput = readFileSync(join(__dirname, './index.ts'), 'utf-8');
  const out = mockWritable();
  buildSchema(xsd, json, out).unsafeUnwrap();
  const expectedOutput = out.toString();
  expect(currentOutput).toEqual(expectedOutput);
});
