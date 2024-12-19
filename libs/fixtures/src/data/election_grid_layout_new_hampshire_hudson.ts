import * as builders from '../builders';

export const electionJson = builders.election(
  'data/electionGridLayoutNewHampshireHudson/election.json'
);
export const { readElection, readElectionDefinition } = electionJson;
export const definitionXml = builders.file(
  'data/electionGridLayoutNewHampshireHudson/definition.xml'
);
export const scanMarkedFront = builders.image(
  'data/electionGridLayoutNewHampshireHudson/scan-marked-front.jpeg'
);
export const scanMarkedBack = builders.image(
  'data/electionGridLayoutNewHampshireHudson/scan-marked-back.jpeg'
);
export const scanMarkedRotatedFront = builders.image(
  'data/electionGridLayoutNewHampshireHudson/scan-marked-rotated-front.jpeg'
);
export const scanMarkedRotatedBack = builders.image(
  'data/electionGridLayoutNewHampshireHudson/scan-marked-rotated-back.jpeg'
);
export const scanMarkedFront300dpi = builders.image(
  'data/electionGridLayoutNewHampshireHudson/scan-marked-front-300dpi.jpeg'
);
export const scanMarkedBack300dpi = builders.image(
  'data/electionGridLayoutNewHampshireHudson/scan-marked-back-300dpi.jpeg'
);
export const scanUnmarkedFront = builders.image(
  'data/electionGridLayoutNewHampshireHudson/scan-unmarked-front.jpeg'
);
export const scanUnmarkedBack = builders.image(
  'data/electionGridLayoutNewHampshireHudson/scan-unmarked-back.jpeg'
);
export const templateFront = builders.image(
  'data/electionGridLayoutNewHampshireHudson/template-front.jpeg'
);
export const templateBack = builders.image(
  'data/electionGridLayoutNewHampshireHudson/template-back.jpeg'
);
export const templatePdf = builders.file(
  'data/electionGridLayoutNewHampshireHudson/template.pdf'
);
