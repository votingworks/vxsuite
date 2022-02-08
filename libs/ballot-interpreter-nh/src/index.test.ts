import { promises as fs } from 'fs';
import { join } from 'path';
import { convertElectionDefinition, NewHampshireBallotCardDefinition } from '.';
import { readGrayscaleImage } from './images';

async function readHudsonBallotCardDefinition(): Promise<NewHampshireBallotCardDefinition> {
  return {
    metadata: await fs.readFile(
      join(__dirname, '../test/fixtures/hudson.xml'),
      'utf8'
    ),
    front: await readGrayscaleImage(
      join(__dirname, '../test/fixtures/hudson_p1.jpg')
    ),
    back: await readGrayscaleImage(
      join(__dirname, '../test/fixtures/hudson_p2.jpg')
    ),
  };
}

test('converting a single ballot card definition', async () => {
  const hudsonBallotCardDefinition = await readHudsonBallotCardDefinition();
  expect(convertElectionDefinition([hudsonBallotCardDefinition]).unsafeUnwrap())
    .toMatchInlineSnapshot(`
    Object {
      "ballotStyles": Array [
        Object {
          "districts": Array [
            "town-id-12101-precinct-id-",
          ],
          "id": "default",
          "precincts": Array [
            "town-id-12101-precinct-id-",
          ],
        },
      ],
      "contests": Array [],
      "county": Object {
        "id": "12101",
        "name": "Hudson",
      },
      "date": "2020-11-03T12:00:00.000-05:00",
      "districts": Array [
        Object {
          "id": "town-id-12101-precinct-id-",
          "name": "Hudson",
        },
      ],
      "parties": Array [],
      "precincts": Array [
        Object {
          "id": "town-id-12101-precinct-id-",
          "name": "Hudson",
        },
      ],
      "state": "NH",
      "title": "General Election",
    }
  `);
});

test('not enough card definitions', () => {
  expect(() =>
    convertElectionDefinition([]).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot(
    `"at least one ballot card definition is required"`
  );
});

test('missing ElectionID', async () => {
  const hudsonBallotCardDefinition = await readHudsonBallotCardDefinition();

  expect(() =>
    convertElectionDefinition([
      {
        ...hudsonBallotCardDefinition,
        metadata: hudsonBallotCardDefinition.metadata.replace(
          /<ElectionID>.*<\/ElectionID>/,
          ''
        ),
      },
    ]).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"ElectionID is required"');
});

test('missing ElectionName', async () => {
  const hudsonBallotCardDefinition = await readHudsonBallotCardDefinition();

  expect(() =>
    convertElectionDefinition([
      {
        ...hudsonBallotCardDefinition,
        metadata: hudsonBallotCardDefinition.metadata.replace(
          /<ElectionName>.*<\/ElectionName>/,
          ''
        ),
      },
    ]).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"ElectionName is required"');
});

test('missing TownName', async () => {
  const hudsonBallotCardDefinition = await readHudsonBallotCardDefinition();

  expect(() =>
    convertElectionDefinition([
      {
        ...hudsonBallotCardDefinition,
        metadata: hudsonBallotCardDefinition.metadata.replace(
          /<TownName>.*<\/TownName>/,
          ''
        ),
      },
    ]).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"TownName is required"');
});

test('missing TownID', async () => {
  const hudsonBallotCardDefinition = await readHudsonBallotCardDefinition();

  expect(() =>
    convertElectionDefinition([
      {
        ...hudsonBallotCardDefinition,
        metadata: hudsonBallotCardDefinition.metadata.replace(
          /<TownID>.*<\/TownID/,
          ''
        ),
      },
    ]).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"TownID is required"');
});

test('missing ElectionDate', async () => {
  const hudsonBallotCardDefinition = await readHudsonBallotCardDefinition();

  expect(() =>
    convertElectionDefinition([
      {
        ...hudsonBallotCardDefinition,
        metadata: hudsonBallotCardDefinition.metadata.replace(
          /<ElectionDate>.*<\/ElectionDate>/,
          ''
        ),
      },
    ]).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"ElectionDate is required"');
});

test('missing PrecinctID', async () => {
  const hudsonBallotCardDefinition = await readHudsonBallotCardDefinition();

  expect(() =>
    convertElectionDefinition([
      {
        ...hudsonBallotCardDefinition,
        metadata: hudsonBallotCardDefinition.metadata.replace(
          /<PrecinctID>(.|[\r\n])*<\/PrecinctID>/,
          ''
        ),
      },
    ]).unsafeUnwrap()
  ).toThrowErrorMatchingInlineSnapshot('"PrecinctID is required"');
});
