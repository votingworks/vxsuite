import * as builders from '../builders';

export const electionJson = builders.election(
  'data/electionGridLayoutNewHampshireHudson/election.json'
);
export const { readElection, readElectionDefinition } = electionJson;
export const definitionXml = builders.file(
  'data/electionGridLayoutNewHampshireHudson/definition.xml'
);
