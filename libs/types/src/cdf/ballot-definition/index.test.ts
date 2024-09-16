import { buildSchema } from '@votingworks/cdf-schema-builder';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok } from '@votingworks/basics';
import { BallotDefinitionSchema } from '.';
import { mockWritable } from '../../../test/helpers/mock_writable';
import { testCdfBallotDefinition } from './fixtures';
import {
  findUnusedDefinitions,
  isSubsetCdfSchema,
  validateSchema,
} from '../../../test/cdf_schema_utils';

const nistXsd = readFileSync(
  join(__dirname, '../../../data/cdf/ballot-definition/nist-schema.xsd'),
  'utf-8'
);
const nistJson = readFileSync(
  join(__dirname, '../../../data/cdf/ballot-definition/nist-schema.json'),
  'utf-8'
);
const nistSchema = JSON.parse(nistJson);
const vxJson = readFileSync(join(__dirname, './vx-schema.json'), 'utf-8');
const vxSchema = JSON.parse(vxJson);

test('BallotDefinition schema', () => {
  BallotDefinitionSchema.parse(testCdfBallotDefinition);
});

test('generated types are in sync with schema', () => {
  const generatedTypes = readFileSync(join(__dirname, './index.ts'), 'utf-8');
  const out = mockWritable();
  buildSchema(nistXsd, vxJson, out).unsafeUnwrap();
  const expectedTypes = out.toString();
  expect(generatedTypes).toEqual(expectedTypes);
});

test('VX and NIST schemas are valid JSON schemas', () => {
  validateSchema(nistSchema);
  validateSchema(vxSchema);
  expect(findUnusedDefinitions(nistSchema)).toEqual([]);
  expect(findUnusedDefinitions(vxSchema)).toEqual([]);
});

test('VX schema accepts a subset of NIST schema', () => {
  expect(isSubsetCdfSchema(vxSchema, nistSchema)).toEqual(ok());
});
