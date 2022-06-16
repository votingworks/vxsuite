import {
  AdjudicationReason,
  BallotPaperSize,
  CandidateContest,
  PartyIdSchema,
  safeParseElection,
  unsafeParse,
} from '@votingworks/types';
import { typedAs } from '@votingworks/utils';
import {
  AmherstFixtureName,
  HudsonFixtureName,
  readFixtureBallotCardDefinition,
  readFixtureDefinition,
  readFixtureJson,
} from '../test/fixtures';
import { asciiOvalGrid } from '../test/utils';
import {
  convertElectionDefinition,
  convertElectionDefinitionHeader,
  ConvertError,
  ConvertErrorKind,
  readGridFromElectionDefinition,
} from './convert';
import * as templates from './data/templates';
import { withSvgDebugger } from './debug';

if (process.env.CI) {
  jest.setTimeout(10_000);
}

test('converting the Hudson ballot', async () => {
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

  // uncomment this to update the fixture
  // await (
  //   await import('fs/promises')
  // ).writeFile(
  //   (
  //     await import('../test/fixtures')
  //   ).getFixturePath(HudsonFixtureName, 'election.json'),
  //   JSON.stringify(electionDefinition, null, 2),
  //   'utf8'
  // );

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

test('mismatched ballot image size', async () => {
  const hudsonBallotCardDefinition = await readFixtureBallotCardDefinition(
    HudsonFixtureName
  );

  hudsonBallotCardDefinition.definition.getElementsByTagName(
    'BallotSize'
  )[0]!.textContent = '8.5X11';

  expect(
    convertElectionDefinition(hudsonBallotCardDefinition, {
      ovalTemplate: await templates.getOvalTemplate(),
    }).unsafeUnwrapErr()
  ).toEqual(
    typedAs<ConvertError>({
      kind: ConvertErrorKind.MismatchedBallotImageSize,
      message:
        'Ballot image size mismatch: XML definition is letter-size, or 684x864, but front image is 684x1080',
      side: 'front',
      ballotPaperSize: BallotPaperSize.Letter,
      expectedImageSize: { width: 684, height: 864 },
      actualImageSize: { width: 684, height: 1080 },
    })
  );
});

test('missing ElectionID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionID')[0]!;
  electionIdElement.parentNode?.removeChild(electionIdElement);

  expect(
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr()
  ).toEqual(
    typedAs<ConvertError>({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'ElectionID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionID',
    })
  );
});

test('missing ElectionName', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionNameElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionName')[0]!;
  electionNameElement.parentNode?.removeChild(electionNameElement);

  expect(
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr()
  ).toEqual(
    typedAs<ConvertError>({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'ElectionName is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionName',
    })
  );
});

test('missing TownName', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const townNameElement =
    hudsonBallotCardDefinition.getElementsByTagName('TownName')[0]!;
  townNameElement.parentNode?.removeChild(townNameElement);

  expect(
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr()
  ).toEqual(
    typedAs<ConvertError>({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'TownName is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > TownName',
    })
  );
});

test('missing TownID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const townIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('TownID')[0]!;
  townIdElement.parentNode?.removeChild(townIdElement);

  expect(
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr()
  ).toEqual(
    typedAs<ConvertError>({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'TownID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > TownID',
    })
  );
});

test('missing ElectionDate', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionDateElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionDate')[0]!;
  electionDateElement.parentNode?.removeChild(electionDateElement);

  expect(
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr()
  ).toEqual(
    typedAs<ConvertError>({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'ElectionDate is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionDate',
    })
  );
});

test('missing PrecinctID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const precinctIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('PrecinctID')[0]!;
  precinctIdElement.parentNode?.removeChild(precinctIdElement);

  expect(
    convertElectionDefinitionHeader(
      hudsonBallotCardDefinition
    ).unsafeUnwrapErr()
  ).toEqual(
    typedAs<ConvertError>({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message: 'PrecinctID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > PrecinctID',
    })
  );
});

test('multi-party endorsement', async () => {
  const amherstBallotCardDefinition = await readFixtureDefinition(
    AmherstFixtureName
  );

  expect(
    convertElectionDefinitionHeader(amherstBallotCardDefinition).unsafeUnwrap()
      .contests
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining(
        typedAs<Partial<CandidateContest>>({
          id: 'Sheriff-4243fe0b',
          title: 'Sheriff',
          candidates: [
            {
              id: 'Edward-Randolph-bf4c848a',
              name: 'Edward Randolph',
              partyIds: [
                unsafeParse(PartyIdSchema, 'Democratic-aea20adb'),
                unsafeParse(PartyIdSchema, 'Republican-f0167ce7'),
              ],
            },
          ],
        })
      ),
    ])
  );
});

test('missing Party on multi-party endorsement', async () => {
  const amherstBallotCardDefinition = await readFixtureDefinition(
    AmherstFixtureName
  );

  const sheriffElement = Array.from(
    amherstBallotCardDefinition.getElementsByTagName('Candidates')
  ).find((candidates) => {
    const officeName = candidates
      .getElementsByTagName('OfficeName')[0]!
      .getElementsByTagName('Name')[0]!.textContent;
    return officeName === 'Sheriff';
  })!;
  const sheriffCandidateElements =
    sheriffElement.getElementsByTagName('CandidateName');
  // const sheriffCandidateFirstElement = sheriffCandidateElements[0]!;
  const sheriffCandidateSecondElement = sheriffCandidateElements[1]!;

  const sheriffCandidateSecondPartyElement =
    sheriffCandidateSecondElement.getElementsByTagName('Party')[0]!;
  sheriffCandidateSecondPartyElement.parentNode!.removeChild(
    sheriffCandidateSecondPartyElement
  );

  expect(
    convertElectionDefinitionHeader(
      amherstBallotCardDefinition
    ).unsafeUnwrapErr()
  ).toEqual(
    typedAs<ConvertError>({
      kind: ConvertErrorKind.MissingDefinitionProperty,
      message:
        'Party is missing in candidate "Edward Randolph" of office "Sheriff", required for multi-party endorsement',
      property: 'AVSInterface > Candidates > CandidateName > Party',
    })
  );
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
      AdjudicationReason.MarkedWriteIn,
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
