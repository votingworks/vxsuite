import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { err, ok, type Result } from '@votingworks/basics';
import type {
  CandidateContest,
  Contest,
  District,
  Election,
  ElectionId,
  ElectionRegisteredVoterCounts,
  Party,
  PollingPlace,
  Precinct,
  PrecinctId,
  PrecinctRegisteredVoterCountEntry,
  YesNoContest,
} from '@votingworks/types';
import type {
  DuplicateContestError,
  DuplicateDistrictError,
  DuplicatePartyError,
  DuplicatePrecinctError,
  ElectionRecord,
  SetPollingPlaceError,
} from '../election_record.js';
import { createBlankElection } from '../election_load.js';
import {
  getStateFeaturesConfig,
  type StateFeaturesConfig,
} from '../features.js';

type MaybePromise<T> = T | Promise<T>;

export interface ContractElectionStore {
  getElection(electionId: ElectionId): MaybePromise<ElectionRecord>;
  deleteElection(electionId: ElectionId): MaybePromise<void>;
  updateDistricts(input: {
    electionId: ElectionId;
    deletedDistrictIds?: string[];
    newDistricts?: District[];
    updatedDistricts?: District[];
  }): MaybePromise<Result<void, DuplicateDistrictError>>;
  createPrecinct(
    electionId: ElectionId,
    precinct: Precinct
  ): MaybePromise<Result<void, DuplicatePrecinctError>>;
  updatePrecinct(
    electionId: ElectionId,
    precinct: Precinct
  ): MaybePromise<Result<void, DuplicatePrecinctError>>;
  deletePrecinct(
    electionId: ElectionId,
    precinctId: PrecinctId
  ): MaybePromise<void>;
  setPrecinctRegisteredVoterCounts(
    precinct: Precinct,
    registeredVoterCounts?: PrecinctRegisteredVoterCountEntry
  ): MaybePromise<void>;
  getRegisteredVoterCounts(
    electionId: ElectionId
  ): MaybePromise<ElectionRegisteredVoterCounts>;
  updateParties(input: {
    electionId: ElectionId;
    deletedPartyIds?: string[];
    newParties?: Party[];
    updatedParties?: Party[];
  }): MaybePromise<Result<void, DuplicatePartyError>>;
  createContest(
    electionId: ElectionId,
    contest: Contest
  ): MaybePromise<Result<void, DuplicateContestError>>;
  updateContest(
    electionId: ElectionId,
    contest: Contest
  ): MaybePromise<Result<void, DuplicateContestError>>;
  reorderContests(
    electionId: ElectionId,
    contestIds: string[]
  ): MaybePromise<void>;
  deleteContest(electionId: ElectionId, contestId: string): MaybePromise<void>;
  listPollingPlaces(electionId: ElectionId): MaybePromise<PollingPlace[]>;
  setPollingPlace(
    electionId: ElectionId,
    place: PollingPlace
  ): MaybePromise<Result<void, SetPollingPlaceError>>;
  deletePollingPlace(p: { electionId: string; id: string }): MaybePromise<void>;
}

export interface ContractHarness {
  store: ContractElectionStore;
  createElection(election: Election): Promise<void>;
  cleanUp(): Promise<void>;
}

export type ContractHarnessFactory = (
  stateFeatures: StateFeaturesConfig
) => Promise<ContractHarness>;

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

export function describeElectionStoreContract(
  implementationName: string,
  setup: ContractHarnessFactory
): void {
  describe(`election store contract: ${implementationName}`, () => {
    let harness: ContractHarness;
    let store: ContractElectionStore;
    let electionId: ElectionId;

    async function useHarness(features: StateFeaturesConfig): Promise<void> {
      await harness?.cleanUp();
      harness = await setup(features);
      store = harness.store;
      electionId = nextId('election');
      await harness.createElection(
        createBlankElection(electionId, { name: 'County', stateCode: 'DEMO' })
      );
    }

    async function election(): Promise<Election> {
      return (await store.getElection(electionId)).election;
    }

    async function addDistricts(...names: string[]): Promise<District[]> {
      const districts = names.map(district);
      expect(
        await store.updateDistricts({ electionId, newDistricts: districts })
      ).toEqual(ok());
      return districts;
    }

    beforeEach(async () => {
      harness = undefined as unknown as ContractHarness;
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
          await store.updateDistricts({ electionId, newDistricts: [duplicate] })
        ).toEqual(err({ code: 'duplicate-name', districtId: duplicate.id }));
        expect(
          await store.updateDistricts({
            electionId,
            updatedDistricts: [{ ...d2!, name: 'District 1' }],
          })
        ).toEqual(err({ code: 'duplicate-name', districtId: d2!.id }));

        const extra = district('District 3');
        expect(
          await store.updateDistricts({
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
        await harness.createElection(
          createBlankElection(otherElectionId, {
            name: 'County',
            stateCode: 'DEMO',
          })
        );
        expect(
          await store.updateDistricts({
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
        expect(await store.createPrecinct(electionId, p1)).toEqual(ok());
        expect(
          await store.createPrecinct(electionId, precinct('Precinct 1', []))
        ).toEqual(err('duplicate-precinct-name'));
        const p2 = precinct('Precinct 2', []);
        expect(await store.createPrecinct(electionId, p2)).toEqual(ok());
        expect(
          await store.updatePrecinct(electionId, { ...p2, name: 'Precinct 1' })
        ).toEqual(err('duplicate-precinct-name'));
      });

      test('rejects duplicate split names and split district sets', async () => {
        const [d1, d2] = await addDistricts('District 1', 'District 2');
        const precinctId = nextId('precinct');
        expect(
          await store.createPrecinct(electionId, {
            id: precinctId,
            name: 'Precinct 1',
            splits: [
              { id: nextId('split'), name: 'Split', districtIds: [d1!.id] },
              { id: nextId('split'), name: 'Split', districtIds: [d2!.id] },
            ],
          })
        ).toEqual(err('duplicate-split-name'));
        expect(
          await store.createPrecinct(electionId, {
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
          })
        ).toEqual(err('duplicate-split-districts'));
        expect((await election()).precincts).toEqual([]);
      });

      test('round-trips districts, splits and voter counts', async () => {
        const [d1, d2] = await addDistricts('District 1', 'District 2');
        const p1 = precinct('Precinct 1', [d2!.id, d1!.id]);
        expect(await store.createPrecinct(electionId, p1)).toEqual(ok());
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
        expect(await store.updatePrecinct(electionId, split)).toEqual(ok());
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
            await store.createPrecinct(
              electionId,
              precinct(name, ids.toReversed())
            )
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
        await store.createPrecinct(electionId, p1);
        await store.createPrecinct(electionId, p2);
        await store.createContest(
          electionId,
          candidateContest(d1!.id, 'Mayor')
        );
        const kept = candidateContest(d2!.id, 'Clerk');
        await store.createContest(electionId, kept);

        await store.updateDistricts({
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
        await store.createPrecinct(electionId, p1);
        await store.createPrecinct(electionId, p2);
        await store.setPrecinctRegisteredVoterCounts(p1, 10);
        const place = pollingPlace('Town Hall', [p1.id, p2.id]);
        expect(await store.setPollingPlace(electionId, place)).toEqual(ok());

        await store.deletePrecinct(electionId, p1.id);
        expect(await store.getRegisteredVoterCounts(electionId)).toEqual({});
        expect(await store.listPollingPlaces(electionId)).toEqual([
          { ...place, precincts: { [p2.id]: { type: 'whole' } } },
        ]);
      });

      test('creating a precinct generates a polling place when the state edits them', async () => {
        await useHarness({ ...BASE_FEATURES, EDIT_POLLING_PLACES: true });
        const p1 = precinct('Precinct 1', []);
        expect(await store.createPrecinct(electionId, p1)).toEqual(ok());
        const places = await store.listPollingPlaces(electionId);
        expect(places).toHaveLength(1);
        expect(places[0]).toMatchObject({
          type: 'election_day',
          precincts: { [p1.id]: { type: 'whole' } },
        });
        await store.deletePrecinct(electionId, p1.id);
        const p1Again = precinct(p1.name, []);
        expect(await store.createPrecinct(electionId, p1Again)).toEqual(ok());
        expect(await store.listPollingPlaces(electionId)).toHaveLength(1);
      });
    });

    describe('parties', () => {
      test('rejects duplicate name, full name and abbreviation', async () => {
        const dem = party('Democrat', 'Democratic Party', 'D');
        expect(
          await store.updateParties({ electionId, newParties: [dem] })
        ).toEqual(ok());
        for (const [candidateParty, code] of [
          [party('Democrat', 'Other', 'O'), 'duplicate-name'],
          [party('Other', 'Democratic Party', 'O'), 'duplicate-full-name'],
          [party('Other', 'Other Party', 'D'), 'duplicate-abbrev'],
        ] as const) {
          expect(
            await store.updateParties({
              electionId,
              newParties: [candidateParty],
            })
          ).toEqual(err({ code, partyId: candidateParty.id }));
        }
        const rep = party('Republican', 'Republican Party', 'R');
        await store.updateParties({ electionId, newParties: [rep] });
        expect(
          await store.updateParties({
            electionId,
            updatedParties: [{ ...rep, abbrev: 'D' }],
          })
        ).toEqual(err({ code: 'duplicate-abbrev', partyId: rep.id }));
      });

      test('deleting a party clears contest and candidate references', async () => {
        const [d1] = await addDistricts('District 1');
        const dem = party('Democrat', 'Democratic Party', 'D');
        const rep = party('Republican', 'Republican Party', 'R');
        await store.updateParties({ electionId, newParties: [rep, dem] });
        const contest = candidateContest(d1!.id, 'Mayor', {
          partyId: dem.id,
          candidates: [
            candidate('Ann', 'Alpha', { partyIds: [rep.id, dem.id] }),
          ],
        });
        expect(await store.createContest(electionId, contest)).toEqual(ok());
        let stored = (await election()).contests[0] as CandidateContest;
        expect(stored.candidates[0]!.partyIds).toEqual([dem.id, rep.id]);

        await store.updateParties({ electionId, deletedPartyIds: [dem.id] });
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
        expect(await store.createContest(electionId, mayor)).toEqual(ok());
        expect(
          await store.createContest(
            electionId,
            candidateContest(d1!.id, 'Mayor')
          )
        ).toEqual(err('duplicate-contest'));
        expect(
          await store.createContest(
            electionId,
            candidateContest(d1!.id, 'Mayor', { termDescription: '4 years' })
          )
        ).toEqual(ok());
        expect(
          await store.createContest(
            electionId,
            candidateContest(d1!.id, 'Mayor', { seats: 2 })
          )
        ).toEqual(ok());

        expect(
          await store.createContest(electionId, yesNoContest(d1!.id, 'Prop 1'))
        ).toEqual(ok());
        expect(
          await store.createContest(electionId, yesNoContest(d1!.id, 'Prop 1'))
        ).toEqual(err('duplicate-contest'));
        expect(
          await store.createContest(
            electionId,
            yesNoContest(d1!.id, 'Prop 2', ['Yes', 'Yes'])
          )
        ).toEqual(err('duplicate-option'));

        const clerk = candidateContest(d1!.id, 'Clerk');
        await store.createContest(electionId, clerk);
        expect(
          await store.updateContest(electionId, { ...clerk, title: 'Mayor' })
        ).toEqual(err('duplicate-contest'));
      });

      test('rejects duplicate candidates within a contest, treating missing names as equal', async () => {
        const [d1] = await addDistricts('District 1');
        expect(
          await store.createContest(
            electionId,
            candidateContest(d1!.id, 'Mayor', {
              candidates: [
                candidate('Ann', 'Alpha'),
                candidate('Ann', 'Alpha'),
              ],
            })
          )
        ).toEqual(err('duplicate-candidate'));
        expect(
          await store.createContest(
            electionId,
            candidateContest(d1!.id, 'Mayor', {
              candidates: [
                candidate('Ann', 'Alpha'),
                candidate('Ann', 'Alpha', { middleName: 'B' }),
              ],
            })
          )
        ).toEqual(ok());
        expect(
          await store.createContest(
            electionId,
            candidateContest(d1!.id, 'Clerk', {
              candidates: [candidate('Ann', 'Alpha')],
            })
          )
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
        await store.createContest(electionId, prop);
        await store.createContest(electionId, mayor);
        await store.createContest(electionId, clerk);
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
        expect(await store.updateContest(electionId, reordered)).toEqual(ok());
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
        await store.createContest(electionId, mayor);
        await store.createContest(
          electionId,
          candidateContest(d1!.id, 'Clerk')
        );
        await expect(
          (async () => store.reorderContests(electionId, [mayor.id]))()
        ).rejects.toThrow('Contest list is out of date');
      });

      test('generates the straight party contest on read', async () => {
        await useHarness({ ...BASE_FEATURES, STRAIGHT_PARTY_VOTING: true });
        const [d1] = await addDistricts('District 1');
        await store.createPrecinct(
          electionId,
          precinct('Precinct 1', [d1!.id])
        );
        const dem = party('Democrat', 'Democratic Party', 'D');
        await store.updateParties({ electionId, newParties: [dem] });
        const mayor = candidateContest(d1!.id, 'Mayor');
        await store.createContest(electionId, mayor);
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
        await store.createPrecinct(electionId, p1);
        expect(
          await store.setPollingPlace(electionId, pollingPlace('Hall', [p1.id]))
        ).toEqual(ok());
        expect(
          await store.setPollingPlace(electionId, pollingPlace('Hall', []))
        ).toEqual(err('duplicate-name'));
        expect(
          await store.setPollingPlace(
            electionId,
            pollingPlace('Hall', [], 'absentee')
          )
        ).toEqual(ok());
        expect(
          await store.setPollingPlace(
            electionId,
            pollingPlace('Library', ['no-such-precinct'])
          )
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
          expect(await store.setPollingPlace(electionId, place)).toEqual(ok());
        }
        expect(
          (await store.listPollingPlaces(electionId)).map((p) => p.name)
        ).toEqual(['Mail', 'Early', 'Station 2', 'Station 10']);

        await store.setPollingPlace(electionId, {
          ...places[0]!,
          name: 'Station 1',
        });
        await store.deletePollingPlace({ electionId, id: places[2]!.id });
        expect(
          (await store.listPollingPlaces(electionId)).map((p) => p.name)
        ).toEqual(['Early', 'Station 1', 'Station 2']);
      });
    });

    test('deleting the election removes everything', async () => {
      const [d1] = await addDistricts('District 1');
      const p1 = precinct('Precinct 1', [d1!.id]);
      await store.createPrecinct(electionId, p1);
      await store.createContest(electionId, candidateContest(d1!.id, 'Mayor'));
      await store.setPollingPlace(electionId, pollingPlace('Hall', [p1.id]));
      await store.deleteElection(electionId);
      await expect(
        (async () => store.getElection(electionId))()
      ).rejects.toThrow();
    });
  });
}
