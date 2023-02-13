import { buildSchema } from '@votingworks/cdf-schema-builder';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BallotDefinitionSchema } from '.';
import { mockWritable } from '../../../test/helpers/mock_writable';
import { testCdfBallotDefinition } from './convert.test';

test('BallotDefinition', () => {
  BallotDefinitionSchema.parse(testCdfBallotDefinition);
});

test('generated types are in sync with schema', () => {
  const nistXsd = readFileSync(
    join(__dirname, '../../../data/cdf/ballot-definition/nist-schema.xsd'),
    'utf-8'
  );
  const vxJson = readFileSync(join(__dirname, './vx-schema.json'), 'utf-8');
  const generatedTypes = readFileSync(join(__dirname, './index.ts'), 'utf-8');
  const out = mockWritable();
  buildSchema(nistXsd, vxJson, out).unsafeUnwrap();
  const expectedTypes = out.toString();
  expect(generatedTypes).toEqual(expectedTypes);
});
