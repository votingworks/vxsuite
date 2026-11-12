import { expect, test, vi } from 'vitest';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import {
  type ElectionId,
  LanguageCode,
  type Party,
  type PollingPlace,
  type Precinct,
} from '@votingworks/types';
import type { ElectionDefinitionMethods } from './election_definition_methods.js';
import type { StateFeaturesConfig } from './state_features.js';
import type { ElectionInfoUpdate } from './types.js';

export interface ElectionDefinitionMethodsHarness {
  methods: ElectionDefinitionMethods;
  createElection: () => Promise<ElectionId>;
  expectedStateFeatures: StateFeaturesConfig;
}

function electionInfoUpdate(electionId: ElectionId): ElectionInfoUpdate {
  return {
    electionId,
    type: 'primary',
    isMiCombinedBallotPrimary: false,
    date: new DateWithoutTime('2027-03-02'),
    title: 'Primary Election',
    state: 'Demo State',
    jurisdictionName: 'Demo County',
    seal: '<svg>seal</svg>',
    signatureImage: '<svg>signature</svg>',
    signatureCaption: 'Clerk',
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
  };
}

function withoutCombinedPrimary(
  update: ElectionInfoUpdate
): Omit<ElectionInfoUpdate, 'isMiCombinedBallotPrimary'> {
  const { isMiCombinedBallotPrimary: _, ...rest } = update;
  return rest;
}

async function expectRejection(result: unknown): Promise<void> {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(Promise.resolve(result)).rejects.toThrow();
  } finally {
    consoleError.mockRestore();
  }
}

export function describeElectionDefinitionMethods(
  setUp: () =>
    | ElectionDefinitionMethodsHarness
    | Promise<ElectionDefinitionMethodsHarness>
): void {
  test('getElectionInfo returns the election', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();

    expect(await methods.getElectionInfo({ electionId })).toMatchObject({
      electionId,
      type: 'general',
      title: '',
      seal: '',
      languageCodes: [LanguageCode.ENGLISH],
    });
  });

  test('updateElectionInfo round trips election info', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();
    const update = electionInfoUpdate(electionId);

    expect(await methods.updateElectionInfo(update)).toEqual(ok());
    expect(await methods.getElectionInfo({ electionId })).toMatchObject(
      withoutCombinedPrimary(update)
    );
  });

  test('updateElectionInfo trims text fields', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();
    const update = electionInfoUpdate(electionId);

    expect(
      await methods.updateElectionInfo({
        ...update,
        title: '  Primary Election ',
        state: ' Demo State',
        jurisdictionName: 'Demo County  ',
      })
    ).toEqual(ok());
    expect(await methods.getElectionInfo({ electionId })).toMatchObject(
      withoutCombinedPrimary(update)
    );
  });

  test('updateElectionInfo clears an omitted signature', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();
    const {
      signatureImage: _signatureImage,
      signatureCaption: _signatureCaption,
      ...update
    } = electionInfoUpdate(electionId);

    expect(
      await methods.updateElectionInfo(electionInfoUpdate(electionId))
    ).toEqual(ok());
    expect(await methods.updateElectionInfo(update)).toEqual(ok());
    const electionInfo = await methods.getElectionInfo({ electionId });
    expect(electionInfo.signatureImage).toBeUndefined();
    expect(electionInfo.signatureCaption).toBeUndefined();
  });

  test.each(['title', 'state', 'jurisdictionName'] as const)(
    'updateElectionInfo rejects a blank %s',
    async (field) => {
      const { methods, createElection } = await setUp();
      const electionId = await createElection();

      await expectRejection(
        methods.updateElectionInfo({
          ...electionInfoUpdate(electionId),
          [field]: '   ',
        })
      );
    }
  );

  test('getStateFeatures returns the state features', async () => {
    const { methods, createElection, expectedStateFeatures } = await setUp();
    const electionId = await createElection();

    expect(await methods.getStateFeatures({ electionId })).toEqual(
      expectedStateFeatures
    );
  });

  test('deleteElection deletes the election', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();

    await methods.deleteElection({ electionId });
    await expectRejection(methods.getElectionInfo({ electionId }));
  });

  test('getElectionInfo rejects an unknown election', async () => {
    const { methods } = await setUp();

    await expectRejection(methods.getElectionInfo({ electionId: 'unknown' }));
  });

  test('updateElectionInfo rejects an unknown election', async () => {
    const { methods } = await setUp();

    await expectRejection(
      methods.updateElectionInfo(electionInfoUpdate('unknown'))
    );
  });

  test('getStateFeatures rejects an unknown election', async () => {
    const { methods } = await setUp();

    await expectRejection(methods.getStateFeatures({ electionId: 'unknown' }));
  });

  test('updateDistricts adds, renames and deletes districts', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();
    expect(await methods.listDistricts({ electionId })).toEqual([]);

    expect(
      await methods.updateDistricts({
        electionId,
        newDistricts: [
          { id: 'district-10', name: 'District 10' },
          { id: 'district-2', name: 'District 2' },
          { id: 'district-1', name: 'District 1' },
        ],
      })
    ).toEqual(ok());
    expect(await methods.listDistricts({ electionId })).toEqual([
      { id: 'district-1', name: 'District 1' },
      { id: 'district-2', name: 'District 2' },
      { id: 'district-10', name: 'District 10' },
    ]);

    expect(
      await methods.updateDistricts({
        electionId,
        deletedDistrictIds: ['district-1'],
        updatedDistricts: [{ id: 'district-2', name: 'District 1' }],
        newDistricts: [{ id: 'district-3', name: 'District 3' }],
      })
    ).toEqual(ok());
    expect(await methods.listDistricts({ electionId })).toEqual([
      { id: 'district-2', name: 'District 1' },
      { id: 'district-3', name: 'District 3' },
      { id: 'district-10', name: 'District 10' },
    ]);
  });

  test('updateDistricts rejects duplicate names without saving', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();
    const districts = [
      { id: 'district-1', name: 'District 1' },
      { id: 'district-2', name: 'District 2' },
    ];
    expect(
      await methods.updateDistricts({ electionId, newDistricts: districts })
    ).toEqual(ok());

    expect(
      await methods.updateDistricts({
        electionId,
        deletedDistrictIds: ['district-2'],
        newDistricts: [{ id: 'district-3', name: 'District 1' }],
      })
    ).toEqual(err({ code: 'duplicate-name', districtId: 'district-3' }));
    expect(
      await methods.updateDistricts({
        electionId,
        updatedDistricts: [{ id: 'district-2', name: 'District 1' }],
      })
    ).toEqual(err({ code: 'duplicate-name', districtId: 'district-2' }));
    expect(await methods.listDistricts({ electionId })).toEqual(districts);
  });

  test('updateDistricts rejects a blank name', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();

    await expectRejection(
      methods.updateDistricts({
        electionId,
        newDistricts: [{ id: 'district-1', name: '' }],
      })
    );
  });

  test('updateDistricts rejects an unknown district', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();

    await expectRejection(
      methods.updateDistricts({
        electionId,
        updatedDistricts: [{ id: 'unknown', name: 'District 1' }],
      })
    );
  });

  test('listDistricts rejects an unknown election', async () => {
    const { methods } = await setUp();

    await expectRejection(methods.listDistricts({ electionId: 'unknown' }));
  });

  test('updateDistricts rejects an unknown election', async () => {
    const { methods } = await setUp();

    await expectRejection(
      methods.updateDistricts({
        electionId: 'unknown',
        newDistricts: [{ id: 'district-1', name: 'District 1' }],
      })
    );
  });

  const democrats: Party = {
    id: 'party-1',
    name: 'Democrat',
    fullName: 'Democratic Party',
    abbrev: 'D',
  };
  const republicans: Party = {
    id: 'party-2',
    name: 'Republican',
    fullName: 'Republican Party',
    abbrev: 'R',
  };

  test('updateParties adds, edits and deletes parties', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();
    expect(await methods.listParties({ electionId })).toEqual([]);

    expect(
      await methods.updateParties({
        electionId,
        newParties: [republicans, democrats],
      })
    ).toEqual(ok());
    expect(await methods.listParties({ electionId })).toEqual([
      democrats,
      republicans,
    ]);

    const editedRepublicans: Party = {
      ...republicans,
      name: 'Democrat',
      fullName: 'Grand Old Party',
      abbrev: 'GOP',
    };
    const libertarians: Party = {
      id: 'party-3',
      name: 'Libertarian',
      fullName: 'Libertarian Party',
      abbrev: 'L',
    };
    expect(
      await methods.updateParties({
        electionId,
        deletedPartyIds: ['party-1'],
        updatedParties: [editedRepublicans],
        newParties: [libertarians],
      })
    ).toEqual(ok());
    expect(await methods.listParties({ electionId })).toEqual([
      editedRepublicans,
      libertarians,
    ]);
  });

  test('listParties sorts by name alphabetically', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();
    const party2: Party = {
      id: 'party-2',
      name: 'Party 2',
      fullName: 'Party 2',
      abbrev: 'P2',
    };
    const party10: Party = {
      id: 'party-10',
      name: 'Party 10',
      fullName: 'Party 10',
      abbrev: 'P10',
    };
    expect(
      await methods.updateParties({
        electionId,
        newParties: [party2, party10],
      })
    ).toEqual(ok());

    expect(await methods.listParties({ electionId })).toEqual([
      party10,
      party2,
    ]);
  });

  test.each([
    {
      conflict: { name: 'Democrat', fullName: 'Democratic Party', abbrev: 'D' },
      code: 'duplicate-name',
    },
    {
      conflict: { name: 'Other', fullName: 'Democratic Party', abbrev: 'D' },
      code: 'duplicate-full-name',
    },
    {
      conflict: { name: 'Other', fullName: 'Other Party', abbrev: 'D' },
      code: 'duplicate-abbrev',
    },
  ] as const)(
    'updateParties rejects $code first among duplicates without saving',
    async ({ conflict, code }) => {
      const { methods, createElection } = await setUp();
      const electionId = await createElection();
      expect(
        await methods.updateParties({
          electionId,
          newParties: [democrats, republicans],
        })
      ).toEqual(ok());

      expect(
        await methods.updateParties({
          electionId,
          deletedPartyIds: ['party-2'],
          newParties: [{ id: 'party-3', ...conflict }],
        })
      ).toEqual(err({ code, partyId: 'party-3' }));
      expect(
        await methods.updateParties({
          electionId,
          updatedParties: [{ id: 'party-2', ...conflict }],
        })
      ).toEqual(err({ code, partyId: 'party-2' }));
      expect(await methods.listParties({ electionId })).toEqual([
        democrats,
        republicans,
      ]);
    }
  );

  test.each(['name', 'fullName', 'abbrev'] as const)(
    'updateParties rejects a blank %s',
    async (field) => {
      const { methods, createElection } = await setUp();
      const electionId = await createElection();

      await expectRejection(
        methods.updateParties({
          electionId,
          newParties: [{ ...democrats, [field]: '' }],
        })
      );
    }
  );

  test('updateParties rejects an unknown party', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();

    await expectRejection(
      methods.updateParties({ electionId, updatedParties: [democrats] })
    );
  });

  test('party methods reject an unknown election', async () => {
    const { methods } = await setUp();

    await expectRejection(methods.listParties({ electionId: 'unknown' }));
    await expectRejection(
      methods.updateParties({ electionId: 'unknown', newParties: [democrats] })
    );
  });

  async function createElectionWithDistricts(
    harness: ElectionDefinitionMethodsHarness
  ): Promise<ElectionId> {
    const electionId = await harness.createElection();
    expect(
      await harness.methods.updateDistricts({
        electionId,
        newDistricts: [
          { id: 'district-1', name: 'District 1' },
          { id: 'district-2', name: 'District 2' },
        ],
      })
    ).toEqual(ok());
    return electionId;
  }

  test('precincts can be created, updated and deleted', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionWithDistricts(harness);
    expect(await methods.listPrecincts({ electionId })).toEqual([]);
    expect(await methods.getRegisteredVoterCounts({ electionId })).toEqual({});

    const precinct10: Precinct = {
      id: 'precinct-10',
      name: 'Precinct 10',
      districtIds: ['district-2', 'district-1'],
    };
    const precinct2: Precinct = {
      id: 'precinct-2',
      name: 'Precinct 2',
      splits: [
        { id: 'split-b', name: 'Split B', districtIds: ['district-2'] },
        {
          id: 'split-a',
          name: 'Split A',
          districtIds: ['district-1'],
          electionTitleOverride: 'Title Override',
          clerkSignatureCaption: 'Caption',
        },
      ],
    };
    expect(
      await methods.createPrecinct({
        electionId,
        newPrecinct: precinct10,
        registeredVoterCounts: 100,
      })
    ).toEqual(ok());
    expect(
      await methods.createPrecinct({
        electionId,
        newPrecinct: precinct2,
        registeredVoterCounts: { splits: { 'split-a': 20 } },
      })
    ).toEqual(ok());
    expect(await methods.listPrecincts({ electionId })).toEqual([
      {
        id: 'precinct-2',
        name: 'Precinct 2',
        splits: [
          {
            id: 'split-a',
            name: 'Split A',
            districtIds: ['district-1'],
            electionTitleOverride: 'Title Override',
            clerkSignatureCaption: 'Caption',
          },
          { id: 'split-b', name: 'Split B', districtIds: ['district-2'] },
        ],
      },
      { ...precinct10, districtIds: ['district-1', 'district-2'] },
    ]);
    expect(await methods.getRegisteredVoterCounts({ electionId })).toEqual({
      'precinct-10': 100,
      'precinct-2': { splits: { 'split-a': 20 } },
    });

    const updatedPrecinct2: Precinct = {
      id: 'precinct-2',
      name: 'Precinct 2A',
      districtIds: ['district-2'],
    };
    expect(
      await methods.updatePrecinct({
        electionId,
        updatedPrecinct: updatedPrecinct2,
        registeredVoterCounts: 50,
      })
    ).toEqual(ok());
    expect(
      await methods.updatePrecinct({
        electionId,
        updatedPrecinct: precinct10,
      })
    ).toEqual(ok());
    expect(await methods.listPrecincts({ electionId })).toEqual([
      updatedPrecinct2,
      { ...precinct10, districtIds: ['district-1', 'district-2'] },
    ]);
    expect(await methods.getRegisteredVoterCounts({ electionId })).toEqual({
      'precinct-2': 50,
    });

    await methods.deletePrecinct({ electionId, precinctId: 'precinct-2' });
    expect(await methods.listPrecincts({ electionId })).toEqual([
      { ...precinct10, districtIds: ['district-1', 'district-2'] },
    ]);
    expect(await methods.getRegisteredVoterCounts({ electionId })).toEqual({});
  });

  test('precinct edits with duplicate names or split districts are not saved', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionWithDistricts(harness);
    const precinct1: Precinct = {
      id: 'precinct-1',
      name: 'Precinct 1',
      districtIds: ['district-1'],
    };
    const precinct2: Precinct = {
      id: 'precinct-2',
      name: 'Precinct 2',
      districtIds: [],
    };
    for (const newPrecinct of [precinct1, precinct2]) {
      expect(await methods.createPrecinct({ electionId, newPrecinct })).toEqual(
        ok()
      );
    }

    expect(
      await methods.createPrecinct({
        electionId,
        newPrecinct: { id: 'precinct-3', name: 'Precinct 1', districtIds: [] },
      })
    ).toEqual(err('duplicate-precinct-name'));
    expect(
      await methods.updatePrecinct({
        electionId,
        updatedPrecinct: { ...precinct2, name: 'Precinct 1' },
        registeredVoterCounts: 10,
      })
    ).toEqual(err('duplicate-precinct-name'));
    expect(
      await methods.updatePrecinct({
        electionId,
        updatedPrecinct: {
          id: 'precinct-2',
          name: 'Precinct 2',
          splits: [
            { id: 'split-1', name: 'Split', districtIds: ['district-1'] },
            { id: 'split-2', name: 'Split', districtIds: ['district-2'] },
          ],
        },
      })
    ).toEqual(err('duplicate-split-name'));
    expect(
      await methods.createPrecinct({
        electionId,
        newPrecinct: {
          id: 'precinct-3',
          name: 'Precinct 3',
          splits: [
            {
              id: 'split-1',
              name: 'Split 1',
              districtIds: ['district-1', 'district-2'],
            },
            {
              id: 'split-2',
              name: 'Split 2',
              districtIds: ['district-2', 'district-1'],
            },
          ],
        },
      })
    ).toEqual(err('duplicate-split-districts'));

    expect(await methods.listPrecincts({ electionId })).toEqual([
      precinct1,
      precinct2,
    ]);
    expect(await methods.getRegisteredVoterCounts({ electionId })).toEqual({});
  });

  test('createPrecinct rejects a blank name', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();

    await expectRejection(
      methods.createPrecinct({
        electionId,
        newPrecinct: { id: 'precinct-1', name: '', districtIds: [] },
      })
    );
  });

  test('updatePrecinct and deletePrecinct reject an unknown precinct', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();

    await expectRejection(
      methods.updatePrecinct({
        electionId,
        updatedPrecinct: { id: 'unknown', name: 'Precinct 1', districtIds: [] },
      })
    );
    await expectRejection(
      methods.deletePrecinct({ electionId, precinctId: 'unknown' })
    );
  });

  test('precinct methods reject an unknown election', async () => {
    const { methods } = await setUp();
    const precinct: Precinct = {
      id: 'precinct-1',
      name: 'Precinct 1',
      districtIds: [],
    };

    await expectRejection(methods.listPrecincts({ electionId: 'unknown' }));
    await expectRejection(
      methods.createPrecinct({ electionId: 'unknown', newPrecinct: precinct })
    );
    await expectRejection(
      methods.updatePrecinct({
        electionId: 'unknown',
        updatedPrecinct: precinct,
      })
    );
    await expectRejection(
      methods.deletePrecinct({
        electionId: 'unknown',
        precinctId: 'precinct-1',
      })
    );
  });

  async function createElectionWithPrecincts(
    harness: ElectionDefinitionMethodsHarness
  ): Promise<ElectionId> {
    const electionId = await harness.createElection();
    for (const newPrecinct of [
      { id: 'precinct-1', name: 'Precinct 1', districtIds: [] },
      { id: 'precinct-2', name: 'Precinct 2', districtIds: [] },
    ]) {
      expect(
        await harness.methods.createPrecinct({ electionId, newPrecinct })
      ).toEqual(ok());
    }
    return electionId;
  }

  test('createPrecinct creates an election day polling place with EDIT_POLLING_PLACES', async () => {
    const harness = await setUp();
    const electionId = await createElectionWithPrecincts(harness);

    expect(await harness.methods.listPollingPlaces({ electionId })).toEqual(
      harness.expectedStateFeatures.EDIT_POLLING_PLACES
        ? [
            {
              id: expect.any(String),
              name: 'Precinct 1',
              precincts: { 'precinct-1': { type: 'whole' } },
              type: 'election_day',
            },
            {
              id: expect.any(String),
              name: 'Precinct 2',
              precincts: { 'precinct-2': { type: 'whole' } },
              type: 'election_day',
            },
          ]
        : []
    );
  });

  test('polling places can be set, listed and deleted', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionWithPrecincts(harness);
    const generatedPlaces = await methods.listPollingPlaces({ electionId });

    const earlyVoting10: PollingPlace = {
      id: 'place-1',
      name: 'Place 10',
      precincts: {
        'precinct-2': { type: 'whole' },
        'precinct-1': { type: 'whole' },
      },
      type: 'early_voting',
    };
    const earlyVoting2: PollingPlace = {
      id: 'place-2',
      name: 'Place 2',
      precincts: {},
      type: 'early_voting',
    };
    const absentee: PollingPlace = {
      id: 'place-3',
      name: 'Place 10',
      precincts: { 'precinct-1': { type: 'whole' } },
      type: 'absentee',
    };
    for (const place of [earlyVoting10, earlyVoting2, absentee]) {
      expect(await methods.setPollingPlace({ electionId, place })).toEqual(
        ok()
      );
    }
    expect(await methods.listPollingPlaces({ electionId })).toEqual([
      absentee,
      earlyVoting2,
      earlyVoting10,
      ...generatedPlaces,
    ]);

    const updatedPlace: PollingPlace = {
      ...earlyVoting10,
      name: 'Place 1',
      precincts: { 'precinct-2': { type: 'whole' } },
      type: 'absentee',
    };
    expect(
      await methods.setPollingPlace({ electionId, place: updatedPlace })
    ).toEqual(ok());
    expect(await methods.listPollingPlaces({ electionId })).toEqual([
      updatedPlace,
      absentee,
      earlyVoting2,
      ...generatedPlaces,
    ]);

    await methods.deletePollingPlace({ electionId, id: absentee.id });
    expect(await methods.listPollingPlaces({ electionId })).toEqual([
      updatedPlace,
      earlyVoting2,
      ...generatedPlaces,
    ]);
  });

  test('polling places with a duplicate name and type or an unknown precinct are not saved', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionWithPrecincts(harness);
    const generatedPlaces = await methods.listPollingPlaces({ electionId });
    const place: PollingPlace = {
      id: 'place-1',
      name: 'Town Hall',
      precincts: { 'precinct-1': { type: 'whole' } },
      type: 'early_voting',
    };
    expect(await methods.setPollingPlace({ electionId, place })).toEqual(ok());

    expect(
      await methods.setPollingPlace({
        electionId,
        place: { ...place, id: 'place-2', precincts: {} },
      })
    ).toEqual(err('duplicate-name'));
    expect(
      await methods.setPollingPlace({
        electionId,
        place: { ...place, id: 'place-2', type: 'absentee' },
      })
    ).toEqual(ok());
    expect(
      await methods.setPollingPlace({
        electionId,
        place: { ...place, precincts: { unknown: { type: 'whole' } } },
      })
    ).toEqual(err('invalid-precinct'));

    expect(await methods.listPollingPlaces({ electionId })).toEqual([
      { ...place, id: 'place-2', type: 'absentee' },
      place,
      ...generatedPlaces,
    ]);
  });

  test('polling place methods reject an unknown election', async () => {
    const { methods } = await setUp();
    const place: PollingPlace = {
      id: 'place-1',
      name: 'Town Hall',
      precincts: {},
      type: 'election_day',
    };

    await expectRejection(methods.listPollingPlaces({ electionId: 'unknown' }));
    await expectRejection(
      methods.setPollingPlace({ electionId: 'unknown', place })
    );
    await expectRejection(
      methods.deletePollingPlace({ electionId: 'unknown', id: 'place-1' })
    );
  });
}
