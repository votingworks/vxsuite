import {
  AdjudicationReason,
  BallotPaperSize,
  safeParseElection,
} from '@votingworks/types';
import { typedAs } from '@votingworks/utils';
import {
  HudsonFixtureName,
  readFixtureBallotCardDefinition,
  readFixtureDefinition,
  readFixtureJson,
} from '../test/fixtures';
import { asciiOvalGrid } from '../test/utils';
import {
  convertElectionDefinition,
  convertElectionDefinitionHeader,
  readGridFromElectionDefinition,
} from './convert';
import * as templates from './data/templates';
import { withSvgDebugger } from './debug';

if (process.env.CI) {
  jest.setTimeout(10_000);
}

test('converting a single ballot card definition', async () => {
  const hudsonBallotCardDefinition = await readFixtureBallotCardDefinition(
    HudsonFixtureName
  );
  const electionDefinition = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, hudsonBallotCardDefinition.front);
    return convertElectionDefinition(hudsonBallotCardDefinition, {
      ovalTemplate: await templates.getOvalTemplate(),
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

  hudsonBallotCardDefinition.getElementsByTagName(
    'BallotSize'
  )[0]!.textContent = '8.5X11';

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
    hudsonBallotCardDefinition.getElementsByTagName('ElectionID')[0]!;
  electionIdElement.parentNode?.removeChild(electionIdElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"ElectionID is required"');
});

test('missing ElectionName', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionNameElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionName')[0]!;
  electionNameElement.parentNode?.removeChild(electionNameElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"ElectionName is required"');
});

test('missing TownName', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const townNameElement =
    hudsonBallotCardDefinition.getElementsByTagName('TownName')[0]!;
  townNameElement.parentNode?.removeChild(townNameElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"TownName is required"');
});

test('missing TownID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const townIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('TownID')[0]!;
  townIdElement.parentNode?.removeChild(townIdElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"TownID is required"');
});

test('missing ElectionDate', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionDateElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionDate')[0]!;
  electionDateElement.parentNode?.removeChild(electionDateElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"ElectionDate is required"');
});

test('missing PrecinctID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const precinctIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('PrecinctID')[0]!;
  precinctIdElement.parentNode?.removeChild(precinctIdElement);

  expect(() =>
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"PrecinctID is required"');
});

test('readGridFromElectionDefinition', async () => {
  const definition = await readFixtureDefinition(
    HudsonFixtureName,
    'definition'
  );
  const grid = readGridFromElectionDefinition(definition);
  expect(asciiOvalGrid(grid)).toMatchInlineSnapshot(`
    "                                  
                                      
                                      
                                      
                                      
                                      
                                      
                                      
                                      
                O      O      O       
                                      
                                     O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O      O       
                                      
                                     O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
    "
  `);
});

test('default adjudication reasons', async () => {
  const hudsonBallotCardDefinition = await readFixtureBallotCardDefinition(
    HudsonFixtureName
  );
  const electionDefinition = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, hudsonBallotCardDefinition.front);
    return convertElectionDefinition(hudsonBallotCardDefinition, {
      ovalTemplate: await templates.getOvalTemplate(),
      debug,
    }).unsafeUnwrap();
  });
  expect(electionDefinition.centralScanAdjudicationReasons).toEqual(
    typedAs<AdjudicationReason[]>([
      AdjudicationReason.UninterpretableBallot,
      AdjudicationReason.Overvote,
      AdjudicationReason.WriteIn,
      AdjudicationReason.BlankBallot,
    ])
  );
  expect(electionDefinition.precinctScanAdjudicationReasons).toEqual(
    typedAs<AdjudicationReason[]>([
      AdjudicationReason.UninterpretableBallot,
      AdjudicationReason.Overvote,
      AdjudicationReason.BlankBallot,
    ])
  );
});
