/* eslint-disable vx/gts-object-literal-types */
/* eslint-disable @typescript-eslint/no-var-requires */
const { hasSplits } = require('@votingworks/types');
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const { regenerateElectionIds } = require('../build/utils.js');

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void>}
 */
exports.up = async (pgm) => {
  const allElections = await pgm.db.select({
    text: 'SELECT id, election_data, precinct_data FROM elections',
  });
  const seenIds = new Set();

  /**
   * @param {{ id: string; election: import('@votingworks/types').Election; precincts: import('@votingworks/types').Precinct[]; }} electionRecord
   */
  function allIds(electionRecord) {
    const { election, precincts } = electionRecord;
    return [
      ...election.districts.map((d) => d.id),
      ...precincts.flatMap((p) => [
        p.id,
        ...(hasSplits(p)
          ? p.splits.flatMap((s) => [s.id, s.districtIds])
          : p.districtIds),
      ]),
      ...election.parties.map((p) => p.id),
      ...election.contests.flatMap((c) => [
        c.id,
        ...(c.type === 'candidate' && c.partyId ? [c.partyId] : []),
        ...(c.type === 'candidate'
          ? c.candidates.flatMap((cand) => [cand.id, ...(cand.partyIds ?? [])])
          : [c.yesOption.id, c.noOption.id]),
      ]),
    ];
  }

  for (const electionRow of allElections) {
    // eslint-disable-next-line camelcase
    const { id: electionId, election_data, precinct_data } = electionRow;
    const election = JSON.parse(election_data);
    const precincts = JSON.parse(precinct_data);
    const electionRecord = { id: electionId, election, precincts };

    const electionIds = allIds(electionRecord);
    const shouldRegenerateIds = electionIds.some((id) => seenIds.has(id));
    for (const id of electionIds) {
      seenIds.add(id);
    }
    if (!shouldRegenerateIds) {
      continue;
    }

    const {
      districts,
      precincts: updatedPrecincts,
      parties,
      contests,
    } = regenerateElectionIds(election, precincts);
    const updatedElection = {
      ...election,
      districts,
      parties,
      precincts: updatedPrecincts.map((p) => ({
        id: p.id,
        name: p.name,
      })),
      contests,
    };
    pgm.sql(
      `
      UPDATE elections
      SET election_data = '${JSON.stringify(updatedElection).replaceAll(
        "'",
        "''"
      )}',
          precinct_data = '${JSON.stringify(updatedPrecincts).replaceAll(
            "'",
            "''"
          )}'
      WHERE id = '${electionId}'
      `
    );
  }
};
