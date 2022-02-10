import { BallotPaperSize, safeParseElection } from '@votingworks/types';
import {
  convertElectionDefinition,
  convertElectionDefinitionHeader,
  readGridFromElectionDefinition,
} from '.';
import {
  HudsonFixtureName,
  readFixtureBallotCardDefinition,
  readFixtureDefinition,
  readFixtureJson,
} from '../test/fixtures';
import { asciiOvalGrid } from '../test/utils';
import { getBallotTemplateOvalImage } from './accuvote';
import { setDebug, withSvgDebugger } from './debug';

test('converting a single ballot card definition', async () => {
  setDebug(true);
  const ovalTemplate = await getBallotTemplateOvalImage();
  const hudsonBallotCardDefinition = await readFixtureBallotCardDefinition(
    HudsonFixtureName
  );
  const electionDefinition = withSvgDebugger((debug) => {
    debug.imageData(0, 0, hudsonBallotCardDefinition.front);
    return convertElectionDefinition(hudsonBallotCardDefinition, {
      ovalTemplate,
      debug,
    }).unsafeUnwrap();
  });
  const election = safeParseElection(
    await readFixtureJson(HudsonFixtureName, 'election')
  ).unsafeUnwrap();
  expect(electionDefinition).toEqual(election);
});

test('letter-size card definition', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  hudsonBallotCardDefinition.querySelector('BallotSize')!.textContent =
    '8.5X11';

  const electionDefinition = convertElectionDefinitionHeader(
    hudsonBallotCardDefinition
  ).unsafeUnwrap();

  expect(electionDefinition.ballotLayout?.paperSize).toEqual(
    BallotPaperSize.Letter
  );
});

test('missing ElectionID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionIdElement =
    hudsonBallotCardDefinition.querySelector('ElectionID')!;
  electionIdElement.parentElement?.removeChild(electionIdElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"ElectionID is required"');
});

test('missing ElectionName', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionNameElement =
    hudsonBallotCardDefinition.querySelector('ElectionName')!;
  electionNameElement.parentElement?.removeChild(electionNameElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"ElectionName is required"');
});

test('missing TownName', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const townNameElement = hudsonBallotCardDefinition.querySelector('TownName')!;
  townNameElement.parentElement?.removeChild(townNameElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"TownName is required"');
});

test('missing TownID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const townIdElement = hudsonBallotCardDefinition.querySelector('TownID')!;
  townIdElement.parentElement?.removeChild(townIdElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"TownID is required"');
});

test('missing ElectionDate', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionDateElement =
    hudsonBallotCardDefinition.querySelector('ElectionDate')!;
  electionDateElement.parentElement?.removeChild(electionDateElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"ElectionDate is required"');
});

test('missing PrecinctID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const precinctIdElement =
    hudsonBallotCardDefinition.querySelector('PrecinctID')!;
  precinctIdElement.parentElement?.removeChild(precinctIdElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"PrecinctID is required"');
});

test('readGridFromElectionDefinition', async () => {
  const definition = await readFixtureDefinition(
    HudsonFixtureName,
    'definition-fixed'
  );
  const grid = readGridFromElectionDefinition(definition);
  expect(asciiOvalGrid(grid)).toMatchInlineSnapshot(`
    "                                 
                                     
                                     
                                     
                                     
                                     
                                     
                                     
                                     
                O      O      O     O
                                     
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O            O
                                     
                                     
                O      O            O
                                     
                                     
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                                     
                                     
                                     
                O      O            O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O            O
                                     
                                     
                O      O            O
                                     
                                     
                O      O            O
    "
  `);
});
