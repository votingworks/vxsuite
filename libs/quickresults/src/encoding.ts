/**
 * Manage QuickResults data encoding and decoding
 */

import {
  CompleteTally,
  SingleTally,
  ElectionDefinition,
  VotingMethod,
  CandidateContest,
  ContestTallies,
  ContestOptionTally,
  Dictionary,
} from '@votingworks/types';
import { BitReader, BitWriter, HexEncoding } from '@votingworks/ballot-encoder';
import { typedAs } from '../../ballot-encoder/node_modules/@votingworks/utils/src';

// VotingWorks didn't have working voting systems until 2019.
// No need to count time since before that,
// or to expect this to last more than 50 years.
const ORIGIN_DATE = new Date('January 1, 2019 00:00:00 GMT+00:00');
const MAX_DATE = new Date('January 1, 2070 00:00:00 GMT+00:00');
const MAX_SECONDS_SINCE_ORIGIN =
  (MAX_DATE.getTime() - ORIGIN_DATE.getTime()) / 1000;

const REPORTED_VOTING_METHODS = [VotingMethod.Precinct, VotingMethod.Absentee];

export function encodeCompleteTally(
  completeTally: CompleteTally,
  electionDefinition: ElectionDefinition
): Uint8Array {
  const bits = new BitWriter();
  bits.writeString('vxqr', { includeLength: false, length: 4 });

  // version number
  bits.writeUint8(1);

  // election hash
  bits.writeString(electionDefinition.electionHash, {
    encoding: HexEncoding,
    includeLength: true,
  });

  // timestamp of generation
  const secondsSinceOrigin =
    (completeTally.generatedAt.getTime() - ORIGIN_DATE.getTime()) / 1000;
  bits.writeUint(secondsSinceOrigin, { max: MAX_SECONDS_SINCE_ORIGIN });

  const maxVoteCount = Math.max(
    ...Object.values(completeTally.precinctTallies).flatMap((singleTally) => {
      if (singleTally === undefined) {
        throw new Error('Problem with tally data structure');
      }

      return Object.values(singleTally.byVotingMethod).flatMap(
        (contestTallies) => {
          if (contestTallies === undefined) {
            throw new Error('Problem with tally data structure');
          }

          return contestTallies.map(
            (contestTally) => contestTally.metadata.ballots
          );
        }
      );
    })
  );
  bits.writeUint(maxVoteCount, { size: 32 });

  // precincts reporting
  for (const precinct of electionDefinition.election.precincts) {
    const singleTally = completeTally.precinctTallies[precinct.id];
    const singleTallyExists = singleTally !== undefined;
    bits.writeBoolean(singleTallyExists);

    if (singleTallyExists) {
      for (const method of REPORTED_VOTING_METHODS) {
        const contestTallies = singleTally.byVotingMethod[method];
        const contestTalliesExists = contestTallies !== undefined;
        bits.writeBoolean(contestTalliesExists);

        if (contestTalliesExists) {
          if (
            contestTallies.length !==
            electionDefinition.election.contests.length
          ) {
            throw new Error(
              `Contest Tallies length is incorrect for precinct ${precinct.id}/${precinct.name} and voting method ${method}`
            );
          }

          for (const [
            contestIndex,
            contest,
          ] of electionDefinition.election.contests.entries()) {
            const contestTally = contestTallies[contestIndex];
            if (!contestTally) {
              throw new Error(
                `Missing contest tally for contest ${contest.title}`
              );
            }

            bits.writeUint(contestTally.metadata.ballots, {
              max: maxVoteCount,
            });
            bits.writeUint(contestTally.metadata.overvotes, {
              max: maxVoteCount,
            });

            switch (contest.type) {
              case 'candidate': {
                const candidateContest = typedAs<CandidateContest>(contest);
                bits.writeUint(contestTally.metadata.undervotes, {
                  max: maxVoteCount * candidateContest.seats,
                });

                for (const candidate of candidateContest.candidates) {
                  const candidateTally = contestTally.tallies[candidate.id];

                  if (candidateTally !== undefined) {
                    bits.writeUint(candidateTally.tally, { max: maxVoteCount });
                  } else {
                    throw new Error(
                      `Contest Tally does not contain candidate counts for Contest ${contest.title} and Candidate ${candidate.name}`
                    );
                  }
                }

                break;
              }
              case 'yesno': {
                bits.writeUint(contestTally.metadata.undervotes, {
                  max: maxVoteCount,
                });

                const yesTally = contestTally.tallies['yes'];
                const noTally = contestTally.tallies['no'];

                if (yesTally !== undefined && noTally !== undefined) {
                  bits.writeUint(yesTally.tally, { max: maxVoteCount });
                  bits.writeUint(noTally.tally, { max: maxVoteCount });
                } else {
                  throw new Error(
                    `Contest Tally does not contain both yes and no counts for YesNoContest ${contest.title}`
                  );
                }
                break;
              }
              default:
                throw new Error(`Unexpected contest type ${contest.type}`);
            }
          }
        }
      }
    }
  }
  return bits.toUint8Array();
}

export function decodeCompleteTally(
  encodedCompleteTally: Uint8Array,
  electionDefinition: ElectionDefinition
): CompleteTally {
  const reader = new BitReader(encodedCompleteTally);

  const prefix = reader.readString({ length: 4 });
  if (prefix !== 'vxqr') {
    throw new Error(
      `Incorrect quickresults prefix, expected "vxqr", got "${prefix}"`
    );
  }

  const versionNumber = reader.readUint8();
  if (versionNumber !== 1) {
    throw new Error(`Bad version number, expected 1, got ${versionNumber}"`);
  }

  const electionHash = reader.readString({
    encoding: HexEncoding,
  });

  if (electionHash !== electionDefinition.electionHash) {
    throw new Error(
      `Election hash does not match, looking for ${electionDefinition.electionHash}, got ${electionHash}.`
    );
  }

  const secondsSinceOrigin = reader.readUint({ max: MAX_SECONDS_SINCE_ORIGIN });
  const generatedAt = new Date();
  generatedAt.setTime(ORIGIN_DATE.getTime() + secondsSinceOrigin * 1000);

  const maxVoteCount = reader.readUint({ size: 32 });

  const completeTally = typedAs<CompleteTally>({
    precinctTallies: {},
    generatedAt,
  });

  for (const precinct of electionDefinition.election.precincts) {
    if (reader.readBoolean()) {
      // this bit indicates whether the precinct is reporting
      const singleTally = typedAs<SingleTally>({
        byVotingMethod: {},
      });
      completeTally.precinctTallies[precinct.id] = singleTally;

      for (const method of REPORTED_VOTING_METHODS) {
        if (reader.readBoolean()) {
          // this reporting method is listed
          const contestTallies = typedAs<ContestTallies>([]);
          singleTally.byVotingMethod[method] = contestTallies;

          for (const contest of electionDefinition.election.contests) {
            const tallies = typedAs<Dictionary<ContestOptionTally>>({});
            const ballots = reader.readUint({ max: maxVoteCount });
            const overvotes = reader.readUint({ max: maxVoteCount });
            let undervotes;

            switch (contest.type) {
              case 'candidate': {
                const candidateContest = contest;
                undervotes = reader.readUint({
                  max: maxVoteCount * candidateContest.seats,
                });

                for (const candidate of candidateContest.candidates) {
                  tallies[candidate.id] = {
                    option: candidate,
                    tally: reader.readUint({ max: maxVoteCount }),
                  };
                }

                break;
              }
              case 'yesno': {
                undervotes = reader.readUint({ max: maxVoteCount });

                tallies['yes'] = {
                  option: ['yes'],
                  tally: reader.readUint({ max: maxVoteCount }),
                };

                tallies['no'] = {
                  option: ['no'],
                  tally: reader.readUint({ max: maxVoteCount }),
                };
                break;
              }
              default:
                throw new Error(`Unexpected contest type ${contest.type}`);
            }

            contestTallies.push({
              contest,
              tallies,
              metadata: {
                overvotes,
                undervotes,
                ballots,
              },
            });
          }
        }
      }
    }
  }
  return completeTally;
}
