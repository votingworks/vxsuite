import { buildSchema } from '@votingworks/cdf-schema-builder';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ElectionReportSchema } from '.';
import { mockWritable } from '../../../test/helpers/mock_writable';
import {
  findUnusedDefinitions,
  validateSchemaDraft04,
} from '../../../test/cdf_schema_utils';
import { testElectionReport } from './fixtures';

const nistXsd = readFileSync(
  join(
    __dirname,
    '../../../data/cdf/election-results-reporting/nist-schema.xsd'
  ),
  'utf-8'
);
const nistJson = readFileSync(
  join(
    __dirname,
    '../../../data/cdf/election-results-reporting/nist-schema.json'
  ),
  'utf-8'
);
const nistSchema = JSON.parse(nistJson);

test('ElectionReportSchema', () => {
  ElectionReportSchema.parse(testElectionReport);
});

test('generated types are in sync with schema', () => {
  const generatedTypes = readFileSync(join(__dirname, './index.ts'), 'utf-8');
  const out = mockWritable();
  buildSchema(nistXsd, nistJson, out).unsafeUnwrap();
  const expectedTypes = out.toString();
  expect(generatedTypes).toEqual(expectedTypes);
});

test('NIST schema is valid JSON schema', () => {
  validateSchemaDraft04(nistSchema);
  expect(findUnusedDefinitions(nistSchema)).toEqual([]);
});
