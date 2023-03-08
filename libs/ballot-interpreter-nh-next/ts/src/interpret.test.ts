import { err, ok, typedAs } from '@votingworks/basics';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { ElectionDefinition, SheetOf } from '@votingworks/types';
import { interpret } from './interpret';
import { InterpretError } from './types';

test('interpret exists', () => {
  expect(interpret).toBeDefined();
});

test('interpret with bad election data', () => {
  const electionDefinition: ElectionDefinition = {
    ...electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
    electionData: 'not json',
  };

  expect(interpret(electionDefinition, ['a', 'b'])).toEqual(
    err(expect.stringContaining('Failed to parse election JSON'))
  );
});

test('interpret with bad ballot image paths', () => {
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;

  expect(interpret(electionDefinition, ['a', 'b'])).toEqual(
    err(
      typedAs<InterpretError>({
        type: 'imageOpenFailure',
        path: expect.stringMatching(/a|b/),
      })
    )
  );
});

test('interpret with valid data', () => {
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;
  const ballotImagePaths: SheetOf<string> = [
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asFilePath(),
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asFilePath(),
  ];

  const result = interpret(electionDefinition, ballotImagePaths);
  expect(result).toEqual(ok(expect.anything()));

  const { front, back } = result.unsafeUnwrap();
  expect(
    [...front.marks, ...back.marks].map(([position, mark]) => ({
      contestId: position.contestId,
      optionId:
        position.type === 'option'
          ? position.optionId
          : `write-in-${position.writeInIndex}`,
      score: mark?.fillScore,
    }))
  ).toMatchInlineSnapshot(`
    [
      {
        "contestId": "Governor-061a401b",
        "optionId": "Josiah-Bartlett-1bb99985",
        "score": 0.38557693,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "John-Langdon-5951c8e1",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Jeremiah-Smith-469560c9",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "Anne-Waldron-ee0cbc85",
        "score": 0,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "James-Poole-db5ef4bd",
        "score": 0.2875,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Obadiah-Carrigan-5c95145a",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Mary-Baker-Eddy-350785d5",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Samuel-Bell-17973275",
        "score": 0.3201923,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "Abeil-Foster-ded38e36",
        "score": 0,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "Hannah-Dustin-ab4ef7c8",
        "score": 0,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "William-Preston-3778fcd5",
        "score": 0.37980768,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Nicholas-Gilman-1791aed7",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "Daniel-Webster-13f77b2d",
        "score": 0,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "Matthew-Thornton-f66fec5e",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Samuel-Livermore-f927fef1",
        "score": 0.3221154,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Elijah-Miller-a52e6988",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Isaac-Hill-d6c9deeb",
        "score": 0,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "Charles-H-Hersey-096286a4",
        "score": 0.2778846,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "John-Spencer-9ffb5970",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Richard-Coote-b9095636",
        "score": 0.32307693,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Abigail-Bartlett-4e46c9d4",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Jacob-Freese-b5146505",
        "score": 0.3326923,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "William-Lovejoy-fde3c2df",
        "score": 0,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "write-in-0",
        "score": 0.24903846,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-2",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-1",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "Edward-Randolph-bf4c848a",
        "score": 0.30192307,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "Ezra-Bartlett-8f95223c",
        "score": 0,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "John-Smith-ef61a579",
        "score": 0,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "John-Mann-b56bbdd3",
        "score": 0.35192308,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "Nathaniel-Parker-56a06c29",
        "score": 0,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "Ichabod-Goodwin-55e8de1f",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "Edward-Randolph-bf4c848a",
        "score": 0,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "Mary-Woolson-dc0b854a",
        "score": 0.31923077,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "Jane-Jones-9caa141f",
        "score": 0,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "Ellen-A-Stileman-14408737",
        "score": 0,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "Claire-Cutts-07a436e7",
        "score": 0.2971154,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "Valbe-Cady-ba3af3af",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "write-in-0",
        "score": 0.37115383,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "write-in-0",
        "score": 0.30865383,
      },
      {
        "contestId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc",
        "optionId": "yes",
        "score": 0.32596153,
      },
      {
        "contestId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc",
        "optionId": "no",
        "score": 0,
      },
    ]
  `);
});
