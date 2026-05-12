import { Id, Tabulation } from '@votingworks/types';
import * as grout from '@votingworks/grout';
import { assertDefined } from '@votingworks/basics';
import { Store } from '../src/store';
import { Api } from '../src/app';
import { MockCastVoteRecordFile, addMockCvrFileToStore } from './mock_cvr_file';

export interface OpenPrimaryFixtureResult {
  cvrIds: string[];
  // Crossover ballot whose Republican vote was adjudicated away → now Dem-only.
  resolvedCrossoverCvrId: string;
  // Dem ballot whose Democratic vote was adjudicated away → now nonpartisan-only.
  flippedToNoPartyCvrId: string;
}

/**
 * Seeds the store with 10 open-primary CVRs covering every party-inference
 * path (single-party, nonpartisan-only, crossover) and applies two
 * adjudications: resolving one crossover and flipping a single-party ballot
 * to nonpartisan.
 */
export async function seedOpenPrimaryCvrsAndAdjudications({
  apiClient,
  electionId,
  store,
}: {
  apiClient: grout.Client<Api>;
  electionId: Id;
  store: Store;
}): Promise<OpenPrimaryFixtureResult> {
  const baseCvr: Omit<MockCastVoteRecordFile[number], 'card' | 'votes'> = {
    ballotStyleGroupId: 'ballot-style-1',
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
  };
  const hmpbSheet1: Tabulation.Card = { type: 'hmpb', sheetNumber: 1 };
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ...baseCvr,
      card: hmpbSheet1,
      votes: {
        'governor-democratic': ['alice-jones'],
        'circuit-court-judge': ['margaret-chen'],
      },
      multiplier: 2,
    },
    {
      ...baseCvr,
      // BMD card in the Dem group: exercises the card-type axis of
      // (group, card) aggregation when combined with the HMPB Dem ballots.
      card: { type: 'bmd' },
      votes: {
        'governor-democratic': ['alice-jones'],
        'circuit-court-judge': ['margaret-chen'],
      },
    },
    {
      ...baseCvr,
      card: hmpbSheet1,
      votes: {
        'governor-republican': ['dave-wilson'],
        'circuit-court-judge': ['margaret-chen'],
      },
      multiplier: 2,
    },
    {
      ...baseCvr,
      // BMD card to exercise (group, card) aggregation in card-tally paths.
      card: { type: 'bmd' },
      votes: {
        'governor-libertarian': ['grace-kim'],
        'circuit-court-judge': ['margaret-chen'],
      },
    },
    {
      ...baseCvr,
      // Sheet 2 to exercise the sheet-number axis of (group, card) aggregation.
      card: { type: 'hmpb', sheetNumber: 2 },
      votes: { 'circuit-court-judge': ['margaret-chen'] },
    },
    {
      ...baseCvr,
      card: hmpbSheet1,
      votes: {
        'governor-democratic': ['bob-smith'],
        'governor-republican': ['ellen-brown'],
        'circuit-court-judge': ['margaret-chen'],
      },
    },
    {
      ...baseCvr,
      card: hmpbSheet1,
      votes: {
        'governor-democratic': ['carol-white'],
        'governor-republican': ['frank-lee'],
        'circuit-court-judge': ['margaret-chen'],
      },
    },
    {
      ...baseCvr,
      card: hmpbSheet1,
      votes: {
        'governor-democratic': ['dan-rivera'],
        'circuit-court-judge': ['margaret-chen'],
      },
    },
  ];
  const cvrIds = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
  });
  // Multiplier expands rows in order, so:
  //   cvrIds[0..1] = Dem-only (HMPB sheet 1)
  //   cvrIds[2]    = Dem-only (BMD)
  //   cvrIds[3..4] = Rep-only (HMPB sheet 1)
  //   cvrIds[5]    = Lib-only (BMD)
  //   cvrIds[6]    = Nonpartisan-only (HMPB sheet 2)
  //   cvrIds[7]    = Crossover (HMPB sheet 1; will be resolved)
  //   cvrIds[8]    = Crossover (HMPB sheet 1; stays)
  //   cvrIds[9]    = Dem-only (HMPB sheet 1; will be flipped to nonpartisan)
  const resolvedCrossoverCvrId = assertDefined(cvrIds[7]);
  const flippedToNoPartyCvrId = assertDefined(cvrIds[9]);

  // Resolve a crossover by removing the gov-republican vote → ballot becomes
  // Dem-only, restoring its gov-democratic vote (bob-smith).
  await apiClient.claimBallotForAdjudication({
    cvrId: resolvedCrossoverCvrId,
  });
  (
    await apiClient.adjudicateCvr({
      cvrId: resolvedCrossoverCvrId,
      contests: [
        {
          contestId: 'governor-republican',
          adjudicatedContestOptionById: {
            'ellen-brown': { type: 'official-option', hasVote: false },
          },
        },
      ],
    })
  ).assertOk('failed to adjudicate crossover');
  // Flip a Dem-only ballot by removing its gov-democratic vote (dan-rivera)
  // → ballot becomes nonpartisan-only.
  await apiClient.claimBallotForAdjudication({
    cvrId: flippedToNoPartyCvrId,
  });
  (
    await apiClient.adjudicateCvr({
      cvrId: flippedToNoPartyCvrId,
      contests: [
        {
          contestId: 'governor-democratic',
          adjudicatedContestOptionById: {
            'dan-rivera': { type: 'official-option', hasVote: false },
          },
        },
      ],
    })
  ).assertOk('failed to flip dem ballot');

  return { cvrIds, resolvedCrossoverCvrId, flippedToNoPartyCvrId };
}
