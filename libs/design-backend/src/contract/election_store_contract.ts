import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import type {
  CandidateContest,
  District,
  Election,
  ElectionId,
  Party,
  PollingPlace,
  Precinct,
  SystemSettings,
  YesNoContest,
} from '@votingworks/types';
import {
  DEFAULT_SYSTEM_SETTINGS,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import type { BallotTemplateId } from '@votingworks/hmpb';
import type {
  GoogleCloudTranslator,
  SpeechSynthesizer,
} from '@votingworks/backend';
import type { DesignElectionStore } from '../design_election_store.js';
import type { TtsEditsStore } from '../design_providers.js';
import type { SharedElectionDesignMethods } from '../election_design_api.js';
import { buildElectionDesignMethods } from '../election_design_methods.js';
import { createBlankElection } from '../election_load.js';
import {
  getStateFeaturesConfig,
  type StateFeaturesConfig,
} from '../features.js';

export interface DesignElectionStoreHarness {
  store: DesignElectionStore;
  jurisdictionId: string;
  cleanUp(): Promise<void>;
}

export type DesignElectionStoreHarnessFactory = (
  stateFeatures: StateFeaturesConfig
) => Promise<DesignElectionStoreHarness>;

const ROUND_TRIP_SNAPSHOT_PATH = join(
  import.meta.dirname,
  '../../src/contract/__snapshots__/round_trip_election.json'
);

const BASE_FEATURES: StateFeaturesConfig = {
  ...getStateFeaturesConfig({ stateCode: 'DEMO' }),
  EDIT_POLLING_PLACES: false,
  STRAIGHT_PARTY_VOTING: false,
};

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${String(idCounter).padStart(6, '0')}`;
}

function district(name: string): District {
  return { id: nextId('district'), name };
}

function precinct(name: string, districtIds: string[]): Precinct {
  return { id: nextId('precinct'), name, districtIds };
}

function party(name: string, fullName: string, abbrev: string): Party {
  return { id: nextId('party'), name, fullName, abbrev };
}

function candidateContest(
  districtId: string,
  title: string,
  overrides: Partial<CandidateContest> = {}
): CandidateContest {
  return {
    id: nextId('contest'),
    type: 'candidate',
    districtId,
    title,
    seats: 1,
    allowWriteIns: true,
    candidates: [],
    ...overrides,
  };
}

function candidate(
  firstName: string,
  lastName: string,
  extra: { middleName?: string; partyIds?: string[] } = {}
): CandidateContest['candidates'][number] {
  return {
    id: nextId('candidate'),
    name: [firstName, extra.middleName, lastName].filter(Boolean).join(' '),
    firstName,
    middleName: extra.middleName,
    lastName,
    partyIds: extra.partyIds,
  };
}

function yesNoContest(
  districtId: string,
  title: string,
  labels: [string, string] = ['Yes', 'No']
): YesNoContest {
  return {
    id: nextId('contest'),
    type: 'yesno',
    districtId,
    title,
    description: `<p>${title}</p>`,
    options: [
      { id: nextId('option'), label: labels[0] },
      { id: nextId('option'), label: labels[1] },
    ],
  };
}

function pollingPlace(
  name: string,
  precinctIds: string[],
  type: PollingPlace['type'] = 'election_day'
): PollingPlace {
  return {
    id: nextId('place'),
    name,
    type,
    precincts: Object.fromEntries(
      precinctIds.map((id) => [id, { type: 'whole' as const }])
    ),
  };
}

export function describeDesignElectionStoreTests(
  implementationName: string,
  setup: DesignElectionStoreHarnessFactory
): void {
  describe(`DesignElectionStore: ${implementationName}`, () => {
    let harness: DesignElectionStoreHarness;
    let store: DesignElectionStore;
    let methods: SharedElectionDesignMethods;
    let features: StateFeaturesConfig;
    let electionId: ElectionId;

    async function createElection(
      election: Election,
      ballotTemplateId: BallotTemplateId = 'VxDefaultBallot',
      systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
    ): Promise<void> {
      await store.createElection({
        jurisdictionId: harness.jurisdictionId,
        stateFeatures: features,
        election,
        isMiCombinedBallotPrimary: false,
        ballotTemplateId,
        systemSettings,
      });
    }

    async function useHarness(
      stateFeatures: StateFeaturesConfig
    ): Promise<void> {
      await harness?.cleanUp();
      features = stateFeatures;
      harness = await setup(stateFeatures);
      store = harness.store;
      methods = buildElectionDesignMethods({
        store,
        features: {
          getJurisdiction: () =>
            Promise.reject(new Error('not used by these tests')),
          getStateFeatures: () => Promise.resolve(stateFeatures),
        },
        translator: {} as GoogleCloudTranslator,
        speechSynthesizer: {} as SpeechSynthesizer,
        ttsEdits: {} as TtsEditsStore,
      });
      electionId = nextId('election');
      await createElection(
        createBlankElection(electionId, { name: 'County', stateCode: 'DEMO' })
      );
    }

    async function election(): Promise<Election> {
      return (await store.getElection(electionId)).election;
    }

    async function addDistricts(...names: string[]): Promise<District[]> {
      const districts = names.map(district);
      expect(
        await methods.updateDistricts({ electionId, newDistricts: districts })
      ).toEqual(ok());
      return districts;
    }

    beforeEach(async () => {
      harness = undefined as unknown as DesignElectionStoreHarness;
      await useHarness(BASE_FEATURES);
    });

    afterEach(async () => {
      await harness.cleanUp();
    });

    describe('districts', () => {
      test('rejects duplicate names on create and update, atomically', async () => {
        const [d1, d2] = await addDistricts('District 1', 'District 2');
        const duplicate = district('District 1');
        expect(
          await methods.updateDistricts({
            electionId,
            newDistricts: [duplicate],
          })
        ).toEqual(err({ code: 'duplicate-name', districtId: duplicate.id }));
        expect(
          await methods.updateDistricts({
            electionId,
            updatedDistricts: [{ ...d2!, name: 'District 1' }],
          })
        ).toEqual(err({ code: 'duplicate-name', districtId: d2!.id }));

        const extra = district('District 3');
        expect(
          await methods.updateDistricts({
            electionId,
            deletedDistrictIds: [d1!.id],
            newDistricts: [extra, district('District 2')],
          })
        ).toMatchObject(err({ code: 'duplicate-name' }));
        expect((await election()).districts.map((d) => d.name)).toEqual([
          'District 1',
          'District 2',
        ]);
      });

      test('allows the same name in another election', async () => {
        await addDistricts('District 1');
        const otherElectionId = nextId('election');
        await createElection(
          createBlankElection(otherElectionId, {
            name: 'County',
            stateCode: 'DEMO',
          })
        );
        expect(
          await methods.updateDistricts({
            electionId: otherElectionId,
            newDistricts: [district('District 1')],
          })
        ).toEqual(ok());
      });

      test('sorts naturally by name', async () => {
        await addDistricts('District 10', 'District 2', 'District 1');
        expect((await election()).districts.map((d) => d.name)).toEqual([
          'District 1',
          'District 2',
          'District 10',
        ]);
      });
    });

    describe('precincts and splits', () => {
      test('rejects duplicate precinct names', async () => {
        const [d1] = await addDistricts('District 1');
        const p1 = precinct('Precinct 1', [d1!.id]);
        expect(
          await methods.createPrecinct({
            electionId: electionId,
            newPrecinct: p1,
          })
        ).toEqual(ok());
        expect(
          await methods.createPrecinct({
            electionId: electionId,
            newPrecinct: precinct('Precinct 1', []),
          })
        ).toEqual(err('duplicate-precinct-name'));
        const p2 = precinct('Precinct 2', []);
        expect(
          await methods.createPrecinct({
            electionId: electionId,
            newPrecinct: p2,
          })
        ).toEqual(ok());
        expect(
          await methods.updatePrecinct({
            electionId: electionId,
            updatedPrecinct: { ...p2, name: 'Precinct 1' },
          })
        ).toEqual(err('duplicate-precinct-name'));
      });

      test('rejects duplicate split names and split district sets', async () => {
        const [d1, d2] = await addDistricts('District 1', 'District 2');
        const precinctId = nextId('precinct');
        expect(
          await methods.createPrecinct({
            electionId: electionId,
            newPrecinct: {
              id: precinctId,
              name: 'Precinct 1',
              splits: [
                { id: nextId('split'), name: 'Split', districtIds: [d1!.id] },
                { id: nextId('split'), name: 'Split', districtIds: [d2!.id] },
              ],
            },
          })
        ).toEqual(err('duplicate-split-name'));
        expect(
          await methods.createPrecinct({
            electionId: electionId,
            newPrecinct: {
              id: precinctId,
              name: 'Precinct 1',
              splits: [
                {
                  id: nextId('split'),
                  name: 'Split A',
                  districtIds: [d1!.id, d2!.id],
                },
                {
                  id: nextId('split'),
                  name: 'Split B',
                  districtIds: [d2!.id, d1!.id],
                },
              ],
            },
          })
        ).toEqual(err('duplicate-split-districts'));
        expect((await election()).precincts).toEqual([]);
      });

      test('round-trips districts, splits and voter counts', async () => {
        const [d1, d2] = await addDistricts('District 1', 'District 2');
        const p1 = precinct('Precinct 1', [d2!.id, d1!.id]);
        expect(
          await methods.createPrecinct({
            electionId: electionId,
            newPrecinct: p1,
          })
        ).toEqual(ok());
        await store.setPrecinctRegisteredVoterCounts(p1, 100);
        expect(await store.getRegisteredVoterCounts(electionId)).toEqual({
          [p1.id]: 100,
        });

        const splitA = {
          id: nextId('split'),
          name: 'A',
          districtIds: [d1!.id],
        };
        const splitB = {
          id: nextId('split'),
          name: 'B',
          districtIds: [d2!.id],
        };
        const split: Precinct = {
          id: p1.id,
          name: 'Precinct 1',
          splits: [splitB, splitA],
        };
        expect(
          await methods.updatePrecinct({
            electionId: electionId,
            updatedPrecinct: split,
          })
        ).toEqual(ok());
        await store.setPrecinctRegisteredVoterCounts(split, {
          splits: { [splitA.id]: 5, [splitB.id]: 7 },
        });
        const stored = (await election()).precincts;
        expect(stored).toEqual([
          { id: p1.id, name: 'Precinct 1', splits: [splitA, splitB] },
        ]);
        expect(await store.getRegisteredVoterCounts(electionId)).toEqual({
          [p1.id]: { splits: { [splitA.id]: 5, [splitB.id]: 7 } },
        });
      });

      test('sorts precincts naturally and district ids within a precinct', async () => {
        const districts = await addDistricts('District 1', 'District 2');
        const ids = districts.map((d) => d.id).toSorted();
        for (const name of ['Precinct 10', 'Precinct 9', 'Precinct 1']) {
          expect(
            await methods.createPrecinct({
              electionId: electionId,
              newPrecinct: precinct(name, ids.toReversed()),
            })
          ).toEqual(ok());
        }
        const stored = (await election()).precincts;
        expect(stored.map((p) => p.name)).toEqual([
          'Precinct 1',
          'Precinct 9',
          'Precinct 10',
        ]);
        expect(stored.map((p) => 'districtIds' in p && p.districtIds)).toEqual([
          ids,
          ids,
          ids,
        ]);
      });

      test('deleting a district removes it from precincts, splits and contests', async () => {
        const [d1, d2] = await addDistricts('District 1', 'District 2');
        const p1 = precinct('Precinct 1', [d1!.id, d2!.id]);
        const p2: Precinct = {
          id: nextId('precinct'),
          name: 'Precinct 2',
          splits: [
            { id: nextId('split'), name: 'A', districtIds: [d1!.id] },
            { id: nextId('split'), name: 'B', districtIds: [d2!.id] },
          ],
        };
        await methods.createPrecinct({
          electionId: electionId,
          newPrecinct: p1,
        });
        await methods.createPrecinct({
          electionId: electionId,
          newPrecinct: p2,
        });
        await methods.createContest({
          electionId: electionId,
          newContest: candidateContest(d1!.id, 'Mayor'),
        });
        const kept = candidateContest(d2!.id, 'Clerk');
        await methods.createContest({
          electionId: electionId,
          newContest: kept,
        });

        await methods.updateDistricts({
          electionId,
          deletedDistrictIds: [d1!.id],
        });
        const e = await election();
        expect(e.precincts[0]).toMatchObject({ districtIds: [d2!.id] });
        expect(e.precincts[1]).toMatchObject({
          splits: [{ districtIds: [] }, { districtIds: [d2!.id] }],
        });
        expect(e.contests.map((c) => c.id)).toEqual([kept.id]);
      });

      test('deleting a precinct removes splits, counts and polling place links', async () => {
        const p1 = precinct('Precinct 1', []);
        const p2 = precinct('Precinct 2', []);
        await methods.createPrecinct({
          electionId: electionId,
          newPrecinct: p1,
        });
        await methods.createPrecinct({
          electionId: electionId,
          newPrecinct: p2,
        });
        await store.setPrecinctRegisteredVoterCounts(p1, 10);
        const place = pollingPlace('Town Hall', [p1.id, p2.id]);
        expect(
          await methods.setPollingPlace({
            electionId: electionId,
            place: place,
          })
        ).toEqual(ok());

        await store.deletePrecinct(electionId, p1.id);
        expect(await store.getRegisteredVoterCounts(electionId)).toEqual({});
        expect(await store.listPollingPlaces(electionId)).toEqual([
          { ...place, precincts: { [p2.id]: { type: 'whole' } } },
        ]);
      });

      test('creating a precinct generates a polling place when the state edits them', async () => {
        await useHarness({ ...BASE_FEATURES, EDIT_POLLING_PLACES: true });
        const p1 = precinct('Precinct 1', []);
        expect(
          await methods.createPrecinct({
            electionId: electionId,
            newPrecinct: p1,
          })
        ).toEqual(ok());
        const places = await store.listPollingPlaces(electionId);
        expect(places).toHaveLength(1);
        expect(places[0]).toMatchObject({
          type: 'election_day',
          precincts: { [p1.id]: { type: 'whole' } },
        });
        await store.deletePrecinct(electionId, p1.id);
        const p1Again = precinct(p1.name, []);
        expect(
          await methods.createPrecinct({
            electionId: electionId,
            newPrecinct: p1Again,
          })
        ).toEqual(ok());
        expect(await store.listPollingPlaces(electionId)).toHaveLength(1);
      });
    });

    describe('parties', () => {
      test('rejects duplicate name, full name and abbreviation', async () => {
        const dem = party('Democrat', 'Democratic Party', 'D');
        expect(
          await methods.updateParties({ electionId, newParties: [dem] })
        ).toEqual(ok());
        for (const [candidateParty, code] of [
          [party('Democrat', 'Other', 'O'), 'duplicate-name'],
          [party('Other', 'Democratic Party', 'O'), 'duplicate-full-name'],
          [party('Other', 'Other Party', 'D'), 'duplicate-abbrev'],
        ] as const) {
          expect(
            await methods.updateParties({
              electionId,
              newParties: [candidateParty],
            })
          ).toEqual(err({ code, partyId: candidateParty.id }));
        }
        const rep = party('Republican', 'Republican Party', 'R');
        await methods.updateParties({ electionId, newParties: [rep] });
        expect(
          await methods.updateParties({
            electionId,
            updatedParties: [{ ...rep, abbrev: 'D' }],
          })
        ).toEqual(err({ code: 'duplicate-abbrev', partyId: rep.id }));
      });

      test('reports the same error when several fields are duplicates', async () => {
        const dem = party('Democrat', 'Democratic Party', 'D');
        await methods.updateParties({ electionId, newParties: [dem] });
        const copy = { ...dem, id: nextId('party') };
        expect(
          await methods.updateParties({ electionId, newParties: [copy] })
        ).toEqual(err({ code: 'duplicate-name', partyId: copy.id }));
      });

      test('deleting a party clears contest and candidate references', async () => {
        const [d1] = await addDistricts('District 1');
        const dem = party('Democrat', 'Democratic Party', 'D');
        const rep = party('Republican', 'Republican Party', 'R');
        await methods.updateParties({ electionId, newParties: [rep, dem] });
        const contest = candidateContest(d1!.id, 'Mayor', {
          partyId: dem.id,
          candidates: [
            candidate('Ann', 'Alpha', { partyIds: [rep.id, dem.id] }),
          ],
        });
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: contest,
          })
        ).toEqual(ok());
        let stored = (await election()).contests[0] as CandidateContest;
        expect(stored.candidates[0]!.partyIds).toEqual([dem.id, rep.id]);

        await methods.updateParties({ electionId, deletedPartyIds: [dem.id] });
        stored = (await election()).contests[0] as CandidateContest;
        expect(stored.partyId).toBeUndefined();
        expect(stored.candidates[0]!.partyIds).toEqual([rep.id]);
        expect((await election()).parties.map((p) => p.name)).toEqual([
          'Republican',
        ]);
      });
    });

    describe('contests and candidates', () => {
      test('rejects duplicate contests, treating missing fields as equal', async () => {
        const [d1] = await addDistricts('District 1');
        const mayor = candidateContest(d1!.id, 'Mayor');
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: mayor,
          })
        ).toEqual(ok());
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: candidateContest(d1!.id, 'Mayor'),
          })
        ).toEqual(err('duplicate-contest'));
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: candidateContest(d1!.id, 'Mayor', {
              termDescription: '4 years',
            }),
          })
        ).toEqual(ok());
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: candidateContest(d1!.id, 'Mayor', { seats: 2 }),
          })
        ).toEqual(ok());

        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: yesNoContest(d1!.id, 'Prop 1'),
          })
        ).toEqual(ok());
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: yesNoContest(d1!.id, 'Prop 1'),
          })
        ).toEqual(err('duplicate-contest'));
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: yesNoContest(d1!.id, 'Prop 2', ['Yes', 'Yes']),
          })
        ).toEqual(err('duplicate-option'));

        const clerk = candidateContest(d1!.id, 'Clerk');
        await methods.createContest({
          electionId: electionId,
          newContest: clerk,
        });
        expect(
          await methods.updateContest({
            electionId: electionId,
            updatedContest: { ...clerk, title: 'Mayor' },
          })
        ).toEqual(err('duplicate-contest'));
      });

      test('rejects duplicate candidates within a contest, treating missing names as equal', async () => {
        const [d1] = await addDistricts('District 1');
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: candidateContest(d1!.id, 'Mayor', {
              candidates: [
                candidate('Ann', 'Alpha'),
                candidate('Ann', 'Alpha'),
              ],
            }),
          })
        ).toEqual(err('duplicate-candidate'));
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: candidateContest(d1!.id, 'Mayor', {
              candidates: [
                candidate('Ann', 'Alpha'),
                candidate('Ann', 'Alpha', { middleName: 'B' }),
              ],
            }),
          })
        ).toEqual(ok());
        expect(
          await methods.createContest({
            electionId: electionId,
            newContest: candidateContest(d1!.id, 'Clerk', {
              candidates: [candidate('Ann', 'Alpha')],
            }),
          })
        ).toEqual(ok());
        expect((await election()).contests).toHaveLength(2);
      });

      test('orders contests and candidates', async () => {
        const [d1] = await addDistricts('District 1');
        const prop = yesNoContest(d1!.id, 'Prop 1');
        const mayor = candidateContest(d1!.id, 'Mayor', {
          candidates: [
            candidate('Zed', 'Zulu'),
            candidate('Ann', 'Alpha'),
            candidate('Mo', 'Mike'),
          ],
        });
        const clerk = candidateContest(d1!.id, 'Clerk');
        await methods.createContest({
          electionId: electionId,
          newContest: prop,
        });
        await methods.createContest({
          electionId: electionId,
          newContest: mayor,
        });
        await methods.createContest({
          electionId: electionId,
          newContest: clerk,
        });
        expect((await election()).contests.map((c) => c.id)).toEqual([
          mayor.id,
          clerk.id,
          prop.id,
        ]);
        expect(
          ((await election()).contests[0] as CandidateContest).candidates.map(
            (c) => c.firstName
          )
        ).toEqual(['Zed', 'Ann', 'Mo']);

        await store.reorderContests(electionId, [prop.id, clerk.id, mayor.id]);
        expect((await election()).contests.map((c) => c.id)).toEqual([
          prop.id,
          clerk.id,
          mayor.id,
        ]);

        const reordered = {
          ...mayor,
          candidates: mayor.candidates.toReversed(),
        };
        expect(
          await methods.updateContest({
            electionId: electionId,
            updatedContest: reordered,
          })
        ).toEqual(ok());
        const e = await election();
        expect(e.contests.map((c) => c.id)).toEqual([
          prop.id,
          clerk.id,
          mayor.id,
        ]);
        expect(
          (e.contests[2] as CandidateContest).candidates.map((c) => c.firstName)
        ).toEqual(['Mo', 'Ann', 'Zed']);

        await store.deleteContest(electionId, clerk.id);
        expect((await election()).contests.map((c) => c.id)).toEqual([
          prop.id,
          mayor.id,
        ]);
      });

      test('rejects a reorder that does not list every contest', async () => {
        const [d1] = await addDistricts('District 1');
        const mayor = candidateContest(d1!.id, 'Mayor');
        await methods.createContest({
          electionId: electionId,
          newContest: mayor,
        });
        await methods.createContest({
          electionId: electionId,
          newContest: candidateContest(d1!.id, 'Clerk'),
        });
        await expect(
          (async () => store.reorderContests(electionId, [mayor.id]))()
        ).rejects.toThrow('Contest list is out of date');
      });

      test('generates the straight party contest on read', async () => {
        await useHarness({ ...BASE_FEATURES, STRAIGHT_PARTY_VOTING: true });
        const [d1] = await addDistricts('District 1');
        await methods.createPrecinct({
          electionId: electionId,
          newPrecinct: precinct('Precinct 1', [d1!.id]),
        });
        const dem = party('Democrat', 'Democratic Party', 'D');
        await methods.updateParties({ electionId, newParties: [dem] });
        const mayor = candidateContest(d1!.id, 'Mayor');
        await methods.createContest({
          electionId: electionId,
          newContest: mayor,
        });
        const contests = (await election()).contests;
        expect(contests.map((c) => c.type)).toEqual([
          'straight-party',
          'candidate',
        ]);
        await store.reorderContests(
          electionId,
          contests.map((c) => c.id)
        );
      });
    });

    describe('polling places', () => {
      test('rejects duplicate name and type, and unknown precincts', async () => {
        const p1 = precinct('Precinct 1', []);
        await methods.createPrecinct({
          electionId: electionId,
          newPrecinct: p1,
        });
        expect(
          await methods.setPollingPlace({
            electionId: electionId,
            place: pollingPlace('Hall', [p1.id]),
          })
        ).toEqual(ok());
        expect(
          await methods.setPollingPlace({
            electionId: electionId,
            place: pollingPlace('Hall', []),
          })
        ).toEqual(err('duplicate-name'));
        expect(
          await methods.setPollingPlace({
            electionId: electionId,
            place: pollingPlace('Hall', [], 'absentee'),
          })
        ).toEqual(ok());
        expect(
          await methods.setPollingPlace({
            electionId: electionId,
            place: pollingPlace('Library', ['no-such-precinct']),
          })
        ).toEqual(err('invalid-precinct'));
        expect(
          (await store.listPollingPlaces(electionId)).map((p) => p.name)
        ).toEqual(['Hall', 'Hall']);
      });

      test('sorts by type then name and replaces on set', async () => {
        const places = [
          pollingPlace('Station 10', []),
          pollingPlace('Station 2', []),
          pollingPlace('Mail', [], 'absentee'),
          pollingPlace('Early', [], 'early_voting'),
        ];
        for (const place of places) {
          expect(
            await methods.setPollingPlace({
              electionId: electionId,
              place: place,
            })
          ).toEqual(ok());
        }
        expect(
          (await store.listPollingPlaces(electionId)).map((p) => p.name)
        ).toEqual(['Mail', 'Early', 'Station 2', 'Station 10']);

        await methods.setPollingPlace({
          electionId: electionId,
          place: {
            ...places[0]!,
            name: 'Station 1',
          },
        });
        await store.deletePollingPlace({ electionId, id: places[2]!.id });
        expect(
          (await store.listPollingPlaces(electionId)).map((p) => p.name)
        ).toEqual(['Early', 'Station 1', 'Station 2']);
      });
    });

    describe('unique indexes as a backstop', () => {
      async function rejects(write: () => unknown): Promise<boolean> {
        try {
          const result = (await write()) as { isOk?: () => boolean };
          return !result?.isOk?.();
        } catch {
          return true;
        }
      }

      test('the store rejects duplicate names even without validation', async () => {
        await addDistricts('District 1');
        expect(
          await rejects(() =>
            store.updateDistricts({
              electionId,
              newDistricts: [district('District 1')],
            })
          )
        ).toEqual(true);

        const dem = party('Democrat', 'Democratic Party', 'D');
        await methods.updateParties({ electionId, newParties: [dem] });
        expect(
          await rejects(() =>
            store.updateParties({
              electionId,
              newParties: [party('Democrat', 'Other Party', 'O')],
            })
          )
        ).toEqual(true);

        const p1 = precinct('Precinct 1', []);
        await methods.createPrecinct({ electionId, newPrecinct: p1 });
        expect(
          await rejects(() =>
            store.createPrecinct(electionId, precinct('Precinct 1', []))
          )
        ).toEqual(true);
      });
    });

    describe('round trip', () => {
      const roundTripElectionId = 'round-trip-election';

      function roundTripElection(): Election {
        const d1 = { id: 'rt-district-1', name: 'District 1' };
        const d2 = { id: 'rt-district-2', name: 'District 2' };
        const d10 = { id: 'rt-district-3', name: 'District 10' };
        const dem = {
          id: 'rt-party-1',
          name: 'Democrat',
          fullName: 'Democratic Party',
          abbrev: 'D',
        };
        const rep = {
          id: 'rt-party-2',
          name: 'Republican',
          fullName: 'Republican Party',
          abbrev: 'R',
        };
        return {
          ...createBlankElection(roundTripElectionId, {
            name: 'Hillsborough County',
            stateCode: 'DEMO',
          }),
          title: 'Round Trip General Election',
          ballotLayout: {
            paperSize: HmpbBallotPaperSize.Legal,
            metadataEncoding: 'qr-code',
          },
          date: new DateWithoutTime('2026-11-03'),
          seal: '<svg>seal</svg>',
          signature: { image: '<svg>signature</svg>', caption: 'Town Clerk' },
          districts: [d1, d2, d10],
          precincts: [
            {
              id: 'rt-precinct-1',
              name: 'Precinct 1',
              districtIds: [d1.id, d2.id],
            },
            {
              id: 'rt-precinct-2',
              name: 'Precinct 2',
              splits: [
                {
                  id: 'rt-split-1',
                  name: 'Split A',
                  districtIds: [d1.id],
                  electionTitleOverride: 'Split A Title',
                  electionSealOverride: '<svg>split seal</svg>',
                  clerkSignatureImage: '<svg>split signature</svg>',
                  clerkSignatureCaption: 'Split Clerk',
                },
                {
                  id: 'rt-split-2',
                  name: 'Split B',
                  districtIds: [d2.id, d10.id],
                },
              ],
            },
            { id: 'rt-precinct-3', name: 'Precinct 10', districtIds: [] },
          ],
          parties: [dem, rep],
          contests: [
            {
              id: 'rt-contest-1',
              type: 'candidate',
              districtId: d1.id,
              title: 'City Council',
              termDescription: '4 years',
              seats: 2,
              allowWriteIns: false,
              candidates: [
                {
                  id: 'rt-candidate-1',
                  name: 'Ann B Alpha',
                  firstName: 'Ann',
                  middleName: 'B',
                  lastName: 'Alpha',
                  designation: 'Incumbent',
                  partyIds: [dem.id, rep.id],
                },
                {
                  id: 'rt-candidate-2',
                  name: 'Zed Zulu',
                  firstName: 'Zed',
                  lastName: 'Zulu',
                  partyIds: [rep.id],
                },
              ],
            },
            {
              id: 'rt-contest-2',
              type: 'candidate',
              districtId: d2.id,
              title: 'Mayor',
              seats: 1,
              allowWriteIns: true,
              candidates: [],
            },
            {
              id: 'rt-contest-3',
              type: 'yesno',
              districtId: d10.id,
              title: 'Question 1',
              description: '<p>Shall the <strong>question</strong> pass?</p>',
              options: [
                { id: 'rt-option-yes', label: 'Yes' },
                { id: 'rt-option-no', label: 'No' },
                { id: 'rt-option-abstain', label: 'Abstain' },
              ],
            },
          ],
          pollingPlaces: [
            {
              id: 'rt-place-1',
              name: 'Mail Ballots',
              type: 'absentee',
              precincts: {
                'rt-precinct-1': { type: 'whole' },
                'rt-precinct-2': { type: 'whole' },
                'rt-precinct-3': { type: 'whole' },
              },
            },
            {
              id: 'rt-place-2',
              name: 'Town Hall',
              type: 'early_voting',
              precincts: { 'rt-precinct-1': { type: 'whole' } },
            },
            {
              id: 'rt-place-3',
              name: 'School Gym',
              type: 'election_day',
              precincts: {
                'rt-precinct-1': { type: 'whole' },
                'rt-precinct-2': { type: 'whole' },
              },
            },
          ],
        };
      }

      const systemSettings: SystemSettings = {
        ...DEFAULT_SYSTEM_SETTINGS,
        disallowCastingOvervotes: true,
      };

      async function storeRoundTripElection(): Promise<Election> {
        const election = roundTripElection();
        await createElection(election, 'NhBallot', systemSettings);
        const [p1, p2] = election.precincts;
        await store.setPrecinctRegisteredVoterCounts(p1!, 1200);
        await store.setPrecinctRegisteredVoterCounts(p2!, {
          splits: { 'rt-split-1': 300, 'rt-split-2': 450 },
        });
        return election;
      }

      test('every stored field comes back unchanged', async () => {
        const input = await storeRoundTripElection();
        const record = await store.getElection(roundTripElectionId);
        const { election } = record;

        expect(election.title).toEqual(input.title);
        expect(election.date).toEqual(input.date);
        expect(election.type).toEqual(input.type);
        expect(election.state).toEqual(input.state);
        expect(election.jurisdiction).toEqual(input.jurisdiction);
        expect(election.seal).toEqual(input.seal);
        expect(election.signature).toEqual(input.signature);
        expect(election.districts).toEqual(input.districts);
        expect(election.precincts).toEqual(input.precincts);
        expect(election.parties).toEqual(input.parties);
        expect(election.contests).toEqual(input.contests);
        expect(election.pollingPlaces).toEqual(input.pollingPlaces);
        expect(record.systemSettings).toEqual(systemSettings);
        expect(record.ballotTemplateId).toEqual('NhBallot');
        expect(record.isMiCombinedBallotPrimary).toEqual(false);
        expect(record.ballotsFinalizedAt).toBeNull();
        expect(
          await store.getBallotLayoutSettings(roundTripElectionId)
        ).toEqual({ paperSize: HmpbBallotPaperSize.Legal, compact: false });
        expect(election.ballotLayout.paperSize).toEqual(
          HmpbBallotPaperSize.Legal
        );
        expect(
          await store.getRegisteredVoterCounts(roundTripElectionId)
        ).toEqual({
          'rt-precinct-1': 1200,
          'rt-precinct-2': {
            splits: { 'rt-split-1': 300, 'rt-split-2': 450 },
          },
        });
      });

      test('the stored election matches the snapshot shared by every implementation', async () => {
        await storeRoundTripElection();
        const record = await store.getElection(roundTripElectionId);
        await expect(
          `${JSON.stringify(
            {
              election: record.election,
              systemSettings: record.systemSettings,
              ballotTemplateId: record.ballotTemplateId,
              ballotLanguageConfigs: record.ballotLanguageConfigs,
              isMiCombinedBallotPrimary: record.isMiCombinedBallotPrimary,
              registeredVoterCounts:
                await store.getRegisteredVoterCounts(roundTripElectionId),
              layout: await store.getBallotLayoutSettings(roundTripElectionId),
            },
            null,
            2
          )}\n`
        ).toMatchFileSnapshot(ROUND_TRIP_SNAPSHOT_PATH);
      });
    });
  });
}
