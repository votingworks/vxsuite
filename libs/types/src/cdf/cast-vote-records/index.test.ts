import { buildSchema } from '@votingworks/cdf-schema-builder';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok } from '@votingworks/basics';
import { mockWritable } from '../../../test/helpers/mock_writable';
import {
  AllocationStatus,
  CastVoteRecordReport,
  CastVoteRecordReportSchema,
  CastVoteRecordVersion,
  CVRType,
  IndicationStatus,
  ReportingUnitType,
} from '.';
import {
  findUnusedDefinitions,
  isSubsetCdfSchema,
  validateSchemaDraft04,
} from '../../../test/cdf_schema_utils';

const castVoteRecordReport: CastVoteRecordReport = {
  '@type': 'CVR.CastVoteRecordReport',
  GeneratedDate: '2022-01-10T12:00:00.000Z',
  ReportGeneratingDeviceIds: ['12345'],
  ReportingDevice: [
    {
      '@type': 'CVR.ReportingDevice',
      '@id': 'SC-01-000',
      Manufacturer: 'VotingWorks',
      Model: 'Test',
    },
  ],
  Version: CastVoteRecordVersion.v1_0_0,
  Election: [
    {
      '@type': 'CVR.Election',
      '@id': '12345',
      Contest: [
        {
          '@type': 'CVR.BallotMeasureContest',
          '@id': '12345',
          ContestSelection: [
            {
              '@type': 'CVR.ContestSelection',
              '@id': '12345',
            },
          ],
        },
      ],
      ElectionScopeId: '12345',
    },
  ],
  GpUnit: [
    {
      '@type': 'CVR.GpUnit',
      '@id': '12345',
      Type: ReportingUnitType.Precinct,
    },
  ],
  CVR: [
    {
      '@type': 'CVR.CVR',
      BallotAuditId: '12345', // ballotId
      BallotStyleId: '1', // ballotStyleId
      BallotStyleUnitId: '6538', // precinctId
      BatchId: '1', // batchId
      CreatingDeviceId: 'SC-01-000', // scannerId
      CurrentSnapshotId: '1',
      // CVR snapshots come in three Types:
      // - original (what the scanner sees on the ballot)
      // - interpreted (votes after applying contest/election rules)
      // - modified (votes after adjudication)
      // Currently, our CVRs are equivalent to the "modified" snapshot.
      // VVSG 2.0 requires all three snapshots be recorded for each ballot
      // (if rules are applied or adjudication occurs).
      CVRSnapshot: [
        {
          '@id': '1',
          '@type': 'CVR.CVRSnapshot',
          Type: CVRType.Modified,
          CVRContest: [
            {
              '@type': 'CVR.CVRContest',
              ContestId: '750000015',
              CVRContestSelection: [
                {
                  '@type': 'CVR.CVRContestSelection',
                  // Candidate id from election def
                  ContestSelectionId: '123',
                  SelectionPosition: [
                    {
                      '@type': 'CVR.SelectionPosition',
                      HasIndication: IndicationStatus.Yes,
                      IsAllocable: AllocationStatus.Yes,
                      NumberVotes: 1,
                    },
                  ],
                },
              ],
              Overvotes: 0,
              Undervotes: 0,
              WriteIns: 0,
            },
          ],
        },
      ],
      BallotSheetId: '1',
      BatchSequenceId: 1,
      UniqueId: 'a8932',
      ElectionId: '1',
    },
    // More ballots go here...
  ],
};

const nistXsd = readFileSync(
  join(__dirname, '../../../data/cdf/cast-vote-records/nist-schema.xsd'),
  'utf-8'
);
const nistJson = readFileSync(
  join(__dirname, '../../../data/cdf/cast-vote-records/nist-schema.json'),
  'utf-8'
);
const nistSchema = JSON.parse(nistJson);
const vxJson = readFileSync(join(__dirname, './vx-schema.json'), 'utf-8');
const vxSchema = JSON.parse(vxJson);

test('CastVoteRecordReport', () => {
  CastVoteRecordReportSchema.parse(castVoteRecordReport);
});

test('generated types are in sync with schema', () => {
  const generatedTypes = readFileSync(join(__dirname, './index.ts'), 'utf-8');
  const out = mockWritable();
  buildSchema(nistXsd, vxJson, out).unsafeUnwrap();
  const expectedTypes = out.toString();
  expect(generatedTypes).toEqual(expectedTypes);
});

test('NIST schemas is valid JSON schema', () => {
  validateSchemaDraft04(nistSchema);
});

test('VX schema is valid JSON schema', () => {
  validateSchemaDraft04(vxSchema);
});

test('VX schema has no unused definitions', () => {
  expect(findUnusedDefinitions(vxSchema)).toEqual([]);
});

test('VX schema accepts a subset of NIST schema', () => {
  expect(isSubsetCdfSchema(vxSchema, nistSchema)).toEqual(ok());
});
