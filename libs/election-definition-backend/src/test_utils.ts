import { expect, test, vi } from 'vitest';
import { DateWithoutTime, ok } from '@votingworks/basics';
import { type ElectionId, LanguageCode } from '@votingworks/types';
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
}
