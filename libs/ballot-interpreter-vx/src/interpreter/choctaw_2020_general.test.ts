import * as choctaw2020 from '../../test/fixtures/election-7c61368c3b-choctaw-general-2020';
import { Interpreter } from '.';

jest.setTimeout(10000);

test('choctaw 2020 general', async () => {
  const { electionDefinition } = choctaw2020;
  const interpreter = new Interpreter({ electionDefinition });

  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2020.blankPage1.imageData(),
      await choctaw2020.blankPage1.metadata()
    )
  );

  await interpreter.addTemplate(
    await interpreter.interpretTemplate(
      await choctaw2020.blankPage2.imageData(),
      await choctaw2020.blankPage2.metadata()
    )
  );

  const p1Interpreted = await interpreter.interpretBallot(
    await choctaw2020.filledInPage1.imageData(),
    await choctaw2020.filledInPage1.metadata()
  );
  expect(
    p1Interpreted.marks.map((mark) => ({
      contest: mark.contestId,
      option: mark.optionId,
      score: mark.score,
    }))
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "contest": "1",
        "option": "1",
        "score": 0.4090909090909091,
      },
      Object {
        "contest": "1",
        "option": "2",
        "score": 0,
      },
      Object {
        "contest": "1",
        "option": "__write-in-0",
        "score": 0,
      },
      Object {
        "contest": "2",
        "option": "21",
        "score": 0.008152173913043478,
      },
      Object {
        "contest": "2",
        "option": "22",
        "score": 0.010869565217391304,
      },
      Object {
        "contest": "2",
        "option": "23",
        "score": 0.5706521739130435,
      },
      Object {
        "contest": "2",
        "option": "__write-in-0",
        "score": 0.016304347826086956,
      },
      Object {
        "contest": "3",
        "option": "31",
        "score": 0.00267379679144385,
      },
      Object {
        "contest": "3",
        "option": "32",
        "score": 0.8529411764705882,
      },
      Object {
        "contest": "3",
        "option": "__write-in-0",
        "score": 0,
      },
      Object {
        "contest": "4",
        "option": "41",
        "score": 0.010869565217391304,
      },
      Object {
        "contest": "4",
        "option": "42",
        "score": 0.01358695652173913,
      },
      Object {
        "contest": "4",
        "option": "__write-in-0",
        "score": 0.7445652173913043,
      },
      Object {
        "contest": "initiative-65",
        "option": "yes",
        "score": 0.6005434782608695,
      },
      Object {
        "contest": "initiative-65",
        "option": "no",
        "score": 0.41847826086956524,
      },
      Object {
        "contest": "initiative-65-a",
        "option": "yes",
        "score": 0.41847826086956524,
      },
      Object {
        "contest": "initiative-65-a",
        "option": "no",
        "score": 0,
      },
    ]
  `);

  const p2Interpreted = await interpreter.interpretBallot(
    await choctaw2020.filledInPage2.imageData(),
    await choctaw2020.filledInPage2.metadata()
  );
  expect(
    p2Interpreted.marks.map((mark) => ({
      contest: mark.contestId,
      option: mark.optionId,
      score: mark.score,
    }))
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "contest": "flag-question",
        "option": "yes",
        "score": 0.6075268817204301,
      },
      Object {
        "contest": "flag-question",
        "option": "no",
        "score": 0.008064516129032258,
      },
      Object {
        "contest": "runoffs-question",
        "option": "yes",
        "score": 0.002688172043010753,
      },
      Object {
        "contest": "runoffs-question",
        "option": "no",
        "score": 0.46774193548387094,
      },
    ]
  `);
});
