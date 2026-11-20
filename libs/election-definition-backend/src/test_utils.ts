import { expect, test, vi } from 'vitest';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import {
  BallotType,
  type Candidate,
  type CandidateContest,
  type ElectionId,
  HmpbBallotPaperSize,
  LanguageCode,
  type Party,
  type PollingPlace,
  type Precinct,
  type YesNoContest,
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

const VALID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';

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

  async function createElectionForContests(
    harness: ElectionDefinitionMethodsHarness
  ): Promise<ElectionId> {
    const electionId = await createElectionWithDistricts(harness);
    expect(
      await harness.methods.updateParties({
        electionId,
        newParties: [democrats, republicans],
      })
    ).toEqual(ok());
    return electionId;
  }

  const ada: Candidate = {
    id: 'candidate-1',
    firstName: 'Ada',
    middleName: 'B.',
    lastName: 'Lovelace',
    name: 'Ada B. Lovelace',
    designation: 'Incumbent',
    partyIds: [republicans.id, democrats.id],
  };
  const grace: Candidate = {
    id: 'candidate-2',
    firstName: 'Grace',
    lastName: 'Hopper',
    name: 'Grace Hopper',
  };
  const alan: Candidate = {
    id: 'candidate-3',
    firstName: 'Alan',
    lastName: 'Turing',
    name: 'Alan Turing',
    partyIds: [democrats.id],
  };
  const mayor: CandidateContest = {
    id: 'mayor',
    type: 'candidate',
    title: 'Mayor',
    districtId: 'district-1',
    seats: 1,
    allowWriteIns: true,
    termDescription: '4 years',
    candidates: [ada, grace],
  };
  const listedMayor: CandidateContest = {
    ...mayor,
    candidates: [{ ...ada, partyIds: [democrats.id, republicans.id] }, grace],
  };
  const council: CandidateContest = {
    id: 'council',
    type: 'candidate',
    title: 'City Council',
    districtId: 'district-2',
    seats: 2,
    allowWriteIns: false,
    partyId: democrats.id,
    candidates: [alan],
  };
  const measure: YesNoContest = {
    id: 'measure',
    type: 'yesno',
    title: 'Measure 1',
    districtId: 'district-1',
    description: '<p>Should we?</p>',
    options: [
      { id: 'measure-yes', label: 'Yes' },
      { id: 'measure-no', label: 'No' },
    ],
  };

  test('createContest puts candidate contests before ballot measures', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionForContests(harness);
    expect(await methods.listContests({ electionId })).toEqual([]);

    for (const contest of [measure, mayor, council]) {
      expect(
        await methods.createContest({ electionId, newContest: contest })
      ).toEqual(ok());
    }
    expect(await methods.listContests({ electionId })).toEqual([
      listedMayor,
      council,
      measure,
    ]);
  });

  test('updateContest edits a contest in place', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionForContests(harness);
    for (const contest of [mayor, council, measure]) {
      expect(
        await methods.createContest({ electionId, newContest: contest })
      ).toEqual(ok());
    }

    const editedMayor: CandidateContest = {
      ...mayor,
      title: 'Mayor of the City',
      seats: 2,
      allowWriteIns: false,
      partyId: republicans.id,
      termDescription: undefined,
      candidates: [
        {
          id: 'candidate-2',
          firstName: 'Grace',
          middleName: 'M.',
          lastName: 'Hopper',
          name: 'Grace M. Hopper',
          partyIds: [republicans.id],
        },
        {
          id: 'candidate-4',
          firstName: 'Katherine',
          lastName: 'Johnson',
          name: 'Katherine Johnson',
        },
      ],
    };
    const editedMeasure: YesNoContest = {
      ...measure,
      title: 'Measure 2',
      description: '<p>Should we not?</p>',
      options: [
        { id: 'measure-yes', label: 'For' },
        { id: 'measure-no', label: 'Against' },
        { id: 'measure-abstain', label: 'Abstain' },
      ],
    };
    expect(
      await methods.updateContest({ electionId, updatedContest: editedMayor })
    ).toEqual(ok());
    expect(
      await methods.updateContest({
        electionId,
        updatedContest: editedMeasure,
      })
    ).toEqual(ok());
    expect(await methods.listContests({ electionId })).toEqual([
      editedMayor,
      council,
      editedMeasure,
    ]);
  });

  test('reorderContests and deleteContest', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionForContests(harness);
    for (const contest of [mayor, council, measure]) {
      expect(
        await methods.createContest({ electionId, newContest: contest })
      ).toEqual(ok());
    }

    await methods.reorderContests({
      electionId,
      contestIds: [measure.id, council.id, mayor.id],
    });
    expect(await methods.listContests({ electionId })).toEqual([
      measure,
      council,
      listedMayor,
    ]);

    await methods.deleteContest({ electionId, contestId: council.id });
    expect(await methods.listContests({ electionId })).toEqual([
      measure,
      listedMayor,
    ]);
  });

  test('reorderContests rejects an out of date contest list', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionForContests(harness);
    for (const contest of [mayor, council]) {
      expect(
        await methods.createContest({ electionId, newContest: contest })
      ).toEqual(ok());
    }

    await expectRejection(
      methods.reorderContests({ electionId, contestIds: [council.id] })
    );
    await expectRejection(
      methods.reorderContests({
        electionId,
        contestIds: [council.id, mayor.id, measure.id],
      })
    );
    expect(await methods.listContests({ electionId })).toEqual([
      listedMayor,
      council,
    ]);
  });

  const otherMeasure: YesNoContest = {
    ...measure,
    id: 'other-measure',
    title: 'Other Measure',
    options: [
      { id: 'other-measure-yes', label: 'Yes' },
      { id: 'other-measure-no', label: 'No' },
    ],
  };

  test.each([
    {
      description: 'the same district, title, seats, term and party',
      existing: mayor,
      conflict: { ...mayor, candidates: [] },
      error: 'duplicate-contest',
    },
    {
      description: 'the same district, title and seats and no term or party',
      conflict: {
        ...council,
        title: mayor.title,
        districtId: mayor.districtId,
        seats: mayor.seats,
        allowWriteIns: true,
        partyId: undefined,
        termDescription: undefined,
        candidates: [],
      },
      error: 'duplicate-contest',
      existing: { ...mayor, termDescription: undefined },
    },
    {
      description: 'the same district and title as a ballot measure',
      conflict: { ...measure, options: otherMeasure.options },
      error: 'duplicate-contest',
      existing: measure,
    },
    {
      description: 'two candidates with the same name',
      conflict: {
        ...council,
        candidates: [
          {
            id: 'candidate-5',
            firstName: 'Ada',
            lastName: 'Lovelace',
            name: 'Ada Lovelace',
          },
          {
            id: 'candidate-6',
            firstName: 'Ada',
            lastName: 'Lovelace',
            name: 'Ada Lovelace',
          },
        ],
      },
      error: 'duplicate-candidate',
      existing: mayor,
    },
    {
      description: 'two options with the same label',
      conflict: {
        ...measure,
        title: 'Measure 3',
        options: [
          { id: 'measure-3-yes', label: 'Yes' },
          { id: 'measure-3-no', label: 'Yes' },
        ],
      },
      error: 'duplicate-option',
      existing: mayor,
    },
  ] as const)(
    'a contest with $description is rejected as $error without saving',
    async ({ existing, conflict, error }) => {
      const harness = await setUp();
      const { methods } = harness;
      const electionId = await createElectionForContests(harness);
      for (const contest of [existing, otherMeasure]) {
        expect(
          await methods.createContest({ electionId, newContest: contest })
        ).toEqual(ok());
      }
      const contests = await methods.listContests({ electionId });

      expect(
        await methods.createContest({
          electionId,
          newContest: { ...conflict, id: 'new-contest' },
        })
      ).toEqual(err(error));
      expect(
        await methods.updateContest({
          electionId,
          updatedContest: { ...conflict, id: otherMeasure.id },
        })
      ).toEqual(err(error));
      expect(await methods.listContests({ electionId })).toEqual(contests);
    }
  );

  test('contests differing only by term, seats or party are not duplicates', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionForContests(harness);
    const contests: CandidateContest[] = [
      { ...mayor, candidates: [] },
      { ...mayor, id: 'mayor-2', termDescription: undefined, candidates: [] },
      { ...mayor, id: 'mayor-3', seats: 2, candidates: [] },
      { ...mayor, id: 'mayor-4', partyId: democrats.id, candidates: [] },
    ];
    for (const contest of contests) {
      expect(
        await methods.createContest({ electionId, newContest: contest })
      ).toEqual(ok());
    }
    expect(await methods.listContests({ electionId })).toEqual(contests);
  });

  test('deleting a district or party updates its contests', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionForContests(harness);
    for (const contest of [mayor, council, measure]) {
      expect(
        await methods.createContest({ electionId, newContest: contest })
      ).toEqual(ok());
    }

    expect(
      await methods.updateParties({
        electionId,
        deletedPartyIds: [democrats.id],
      })
    ).toEqual(ok());
    expect(await methods.listContests({ electionId })).toEqual([
      {
        ...mayor,
        candidates: [{ ...ada, partyIds: [republicans.id] }, grace],
      },
      {
        ...council,
        partyId: undefined,
        candidates: [{ ...alan, partyIds: undefined }],
      },
      measure,
    ]);

    expect(
      await methods.updateDistricts({
        electionId,
        deletedDistrictIds: ['district-1'],
      })
    ).toEqual(ok());
    expect(await methods.listContests({ electionId })).toEqual([
      {
        ...council,
        partyId: undefined,
        candidates: [{ ...alan, partyIds: undefined }],
      },
    ]);
  });

  test('updateParties rejects deleting a party that would make two contests the same', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionForContests(harness);
    const democraticMayor: CandidateContest = {
      ...mayor,
      partyId: democrats.id,
      candidates: [],
    };
    const nonpartisanMayor: CandidateContest = {
      ...mayor,
      id: 'nonpartisan-mayor',
      candidates: [],
    };
    for (const contest of [democraticMayor, nonpartisanMayor]) {
      expect(
        await methods.createContest({ electionId, newContest: contest })
      ).toEqual(ok());
    }

    expect(
      await methods.updateParties({
        electionId,
        deletedPartyIds: [democrats.id],
      })
    ).toEqual(err({ code: 'duplicate-contest', partyId: democrats.id }));
    expect(await methods.listParties({ electionId })).toEqual([
      democrats,
      republicans,
    ]);
    expect(await methods.listContests({ electionId })).toEqual([
      democraticMayor,
      nonpartisanMayor,
    ]);
  });

  test('contest methods reject invalid and unknown contests', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionForContests(harness);

    await expectRejection(
      methods.createContest({
        electionId,
        newContest: { ...mayor, title: '' },
      })
    );
    await expectRejection(
      methods.updateContest({ electionId, updatedContest: mayor })
    );
    await expectRejection(
      methods.deleteContest({ electionId, contestId: mayor.id })
    );
    expect(await methods.listContests({ electionId })).toEqual([]);
  });

  test('contest methods reject an unknown election', async () => {
    const { methods } = await setUp();
    const electionId = 'unknown';

    await expectRejection(methods.listContests({ electionId }));
    await expectRejection(
      methods.createContest({ electionId, newContest: mayor })
    );
    await expectRejection(
      methods.updateContest({ electionId, updatedContest: mayor })
    );
    await expectRejection(
      methods.reorderContests({ electionId, contestIds: [mayor.id] })
    );
    await expectRejection(
      methods.deleteContest({ electionId, contestId: mayor.id })
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
        registeredVoterCounts: { total: 100 },
      })
    ).toEqual(ok());
    expect(
      await methods.createPrecinct({
        electionId,
        newPrecinct: precinct2,
        registeredVoterCounts: { splits: { 'split-a': { total: 20 } } },
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
      'precinct-10': { total: 100 },
      'precinct-2': { splits: { 'split-a': { total: 20 } } },
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
        registeredVoterCounts: { total: 50 },
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
      'precinct-2': { total: 50 },
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
        registeredVoterCounts: { total: 10 },
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

  test('ballot layout settings default to letter and can be updated', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();
    expect(await methods.getBallotLayoutSettings({ electionId })).toEqual({
      paperSize: HmpbBallotPaperSize.Letter,
      compact: false,
    });

    await methods.updateBallotLayoutSettings({
      electionId,
      paperSize: HmpbBallotPaperSize.Legal,
      compact: true,
    });
    expect(await methods.getBallotLayoutSettings({ electionId })).toEqual({
      paperSize: HmpbBallotPaperSize.Legal,
      compact: true,
    });
  });

  test('updateBallotLayoutSettings rejects an invalid paper size', async () => {
    const { methods, createElection } = await setUp();
    const electionId = await createElection();

    await expectRejection(
      methods.updateBallotLayoutSettings({
        electionId,
        paperSize: 'tabloid' as HmpbBallotPaperSize,
        compact: false,
      })
    );
    expect(await methods.getBallotLayoutSettings({ electionId })).toEqual({
      paperSize: HmpbBallotPaperSize.Letter,
      compact: false,
    });
  });

  test('listBallotStyles groups precincts with the same contests', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionWithDistricts(harness);
    expect(await methods.listBallotStyles({ electionId })).toEqual([]);

    for (const precinct of [
      { id: 'precinct-1', name: 'Precinct 1', districtIds: ['district-1'] },
      { id: 'precinct-2', name: 'Precinct 2', districtIds: ['district-1'] },
      {
        id: 'precinct-3',
        name: 'Precinct 3',
        districtIds: ['district-1', 'district-2'],
      },
    ]) {
      expect(
        await methods.createPrecinct({ electionId, newPrecinct: precinct })
      ).toEqual(ok());
    }
    for (const districtId of ['district-1', 'district-2']) {
      const districtMeasure: YesNoContest = {
        id: `measure-${districtId}`,
        type: 'yesno',
        title: `Measure ${districtId}`,
        districtId,
        description: '<p>Should we?</p>',
        options: [
          { id: `measure-${districtId}-yes`, label: 'Yes' },
          { id: `measure-${districtId}-no`, label: 'No' },
        ],
      };
      expect(
        await methods.createContest({
          electionId,
          newContest: districtMeasure,
        })
      ).toEqual(ok());
    }

    expect(await methods.listBallotStyles({ electionId })).toEqual([
      {
        id: '1_en',
        groupId: '1',
        precincts: ['precinct-1', 'precinct-2'],
        districts: ['district-1'],
        languages: [LanguageCode.ENGLISH],
      },
      {
        id: '2_en',
        groupId: '2',
        precincts: ['precinct-3'],
        districts: ['district-1', 'district-2'],
        languages: [LanguageCode.ENGLISH],
      },
    ]);
  });

  test('getBallotPreviewPdf renders a ballot proof', async () => {
    const harness = await setUp();
    const { methods } = harness;
    const electionId = await createElectionWithDistricts(harness);
    expect(
      await methods.updateElectionInfo({
        ...electionInfoUpdate(electionId),
        type: 'general',
        seal: VALID_SVG,
        signatureImage: VALID_SVG,
        languageCodes: [LanguageCode.ENGLISH],
      })
    ).toEqual(ok());
    expect(
      await methods.createPrecinct({
        electionId,
        newPrecinct: {
          id: 'precinct-1',
          name: 'Precinct 1',
          districtIds: ['district-1'],
        },
      })
    ).toEqual(ok());
    expect(
      await methods.createContest({
        electionId,
        newContest: {
          id: 'measure-1',
          type: 'yesno',
          title: 'Measure 1',
          districtId: 'district-1',
          description: '<p>Should we?</p>',
          options: [
            { id: 'measure-1-yes', label: 'Yes' },
            { id: 'measure-1-no', label: 'No' },
          ],
        },
      })
    ).toEqual(ok());

    const result = await methods.getBallotPreviewPdf({
      electionId,
      precinctId: 'precinct-1',
      ballotStyleId: '1_en',
      ballotType: BallotType.Precinct,
      ballotMode: 'test',
    });
    const { pdfData, fileName } = result.unsafeUnwrap();
    expect(fileName).toEqual('PROOF-test-precinct-ballot-Precinct_1-1_en.pdf');
    expect(new TextDecoder().decode(pdfData.slice(0, 5))).toEqual('%PDF-');
  }, 60_000);

  test('ballot style and layout methods reject an unknown election', async () => {
    const { methods } = await setUp();

    await expectRejection(methods.listBallotStyles({ electionId: 'unknown' }));
    await expectRejection(
      methods.getBallotLayoutSettings({ electionId: 'unknown' })
    );
    await expectRejection(
      methods.updateBallotLayoutSettings({
        electionId: 'unknown',
        paperSize: HmpbBallotPaperSize.Legal,
        compact: true,
      })
    );
    await expectRejection(
      methods.getBallotPreviewPdf({
        electionId: 'unknown',
        precinctId: 'precinct-1',
        ballotStyleId: '1_en',
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
      })
    );
  });
}
