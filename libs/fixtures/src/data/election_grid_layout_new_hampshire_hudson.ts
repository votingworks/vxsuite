import * as builders from '../builders.js';

export const electionJson = builders.election(
  'data/electionGridLayoutNewHampshireHudson/election.json'
);
export const { readElection, readElectionDefinition } = electionJson;
export const definitionXml = builders.file(
  'data/electionGridLayoutNewHampshireHudson/definition.xml'
);
