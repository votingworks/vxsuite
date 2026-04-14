import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { afterAll, beforeAll, test, expect } from 'vitest';
import {
  BALLOT_MODES,
  BallotType,
  BaseBallotProps,
  CandidateContest,
  ContestId,
  Election,
  getBallotStyle,
  getContests,
  LanguageCode,
  YesNoContest,
} from '@votingworks/types';
import {
  assert,
  assertDefined,
  find,
  groupBy,
  iter,
  range,
  throwIllegalValue,
} from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import {
  parse as parseHtml,
  HTMLElement as ParsedHTMLElement,
} from 'node-html-parser';
import {
  allBaseBallotProps,
  layOutMinimalBallotsToCreateElectionDefinition,
  renderBallotTemplate,
} from './render_ballot';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { RendererPool } from './renderer';
import { BallotTemplateId, ballotTemplates } from './ballot_templates';
import {
  miClosedPrimaryElectionFixtures,
  msGeneralElectionFixtures,
  nhGeneralElectionFixtures,
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
} from './ballot_fixtures';
import { rotateCandidatesByStatute } from './ballot_templates/nh_ballot_template';
import { generateBallotStyles } from './ballot_styles';
import {
  BALLOT_MEASURE_OPTION_CLASS,
  BUBBLE_CLASS,
  CANDIDATE_OPTION_CLASS,
  OptionInfo,
  WRITE_IN_OPTION_CLASS,
} from './ballot_components';

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});
afterAll(async () => {
  await rendererPool.close();
});

function getOptionInfoFromElement(element: ParsedHTMLElement): OptionInfo {
  const bubbleElement = assertDefined(
    element.querySelector(`.${BUBBLE_CLASS}`)
  );
  return JSON.parse(
    bubbleElement.getAttribute('data-option-info')!
  ) as OptionInfo;
}

function combinations<T extends Record<string, unknown>>(
  arrays: Array<Array<Partial<T>>>
): T[] {
  return arrays.reduce(
    (acc, array) =>
      acc.flatMap((accItem) =>
        array.map((arrayItem) => ({ ...accItem, ...arrayItem }))
      ),
    [{}]
  ) as T[];
}

test('allBaseBallotProps creates props for all possible ballots for an election', () => {
  const election = electionFamousNames2021Fixtures.readElection();
  const allBallotProps = allBaseBallotProps(election);
  const expectedPropCombos = combinations<
    Pick<
      BaseBallotProps,
      'ballotStyleId' | 'precinctId' | 'ballotType' | 'ballotMode'
    >
  >([
    election.ballotStyles.flatMap((ballotStyle) =>
      ballotStyle.precincts.map((precinctId) => ({
        ballotStyleId: ballotStyle.id,
        precinctId,
      }))
    ),
    [{ ballotType: BallotType.Absentee }, { ballotType: BallotType.Precinct }],
    BALLOT_MODES.map((ballotMode) => ({ ballotMode })),
  ]);

  const someBallotStyle = election.ballotStyles[0];
  const somePrecinctId = someBallotStyle.precincts[0];

  expect(allBallotProps).toContainEqual({
    election,
    ballotStyleId: someBallotStyle.id,
    precinctId: somePrecinctId,
    ballotType: BallotType.Precinct,
    ballotMode: 'official',
  });

  expect(allBallotProps).toHaveLength(expectedPropCombos.length);
  for (const expectedPropCombo of expectedPropCombos) {
    const expectedProps: BaseBallotProps = { ...expectedPropCombo, election };
    expect(allBallotProps).toContainEqual(expectedProps);
  }
  for (const actualProps of allBallotProps) {
    expect(actualProps.watermark).toBeUndefined();
  }
});

test('layOutMinimalBallotsToCreateElectionDefinition', async () => {
  const fixtureElectionDefinition = vxFamousNamesFixtures.electionDefinition;
  const allBallotProps = allBaseBallotProps(fixtureElectionDefinition.election);
  const electionDefinition =
    await layOutMinimalBallotsToCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      allBallotProps,
      'vxf'
    );
  expect(electionDefinition).toEqual(fixtureElectionDefinition);
});

test('reorder candidates based on rotation from template', async () => {
  const baseElection = vxFamousNamesFixtures.electionDefinition.election;
  const fixtureElection: Election = {
    ...baseElection,
    ballotStyles: generateBallotStyles({
      ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
      electionId: baseElection.id,
      electionType: baseElection.type,
      parties: baseElection.parties,
      precincts: [...baseElection.precincts],
      ballotTemplateId: 'NhBallot',
      contests: baseElection.contests,
    }),
    signature: {
      caption: 'test caption',
      image: '<svg></svg>',
    },
  };
  const allBallotProps = allBaseBallotProps(fixtureElection);
  const { election } = await layOutMinimalBallotsToCreateElectionDefinition(
    rendererPool,
    ballotTemplates.NhBallot,
    allBallotProps,
    'vxf'
  );

  const {
    contests: fixtureContests,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    gridLayouts: _fixtureGridLayouts,
    ...restFixtureElection
  } = fixtureElection;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { contests, gridLayouts: _gridLayouts, ...restElection } = election;

  expect(restElection).toEqual(restFixtureElection);
  for (const [contest, fixtureContest] of iter(contests).zip(fixtureContests)) {
    assert(contest.id === fixtureContest.id);
    assert(contest.type === 'candidate');
    assert(fixtureContest.type === 'candidate');
    const { candidates, ...restContest } = contest;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { candidates: _fixtureCandidates, ...restFixtureContest } =
      fixtureContest;
    expect(restContest).toEqual(restFixtureContest);
    expect(candidates.map((c) => c.id)).toEqual(
      rotateCandidatesByStatute(fixtureContest).map((c) => c.id)
    );
  }
});

test('ballot measure contests with additional options are transformed into candidate contests', async () => {
  const fixtureSpec = nhGeneralElectionFixtures.fixtureSpecs[0];
  const specElection = fixtureSpec.allBallotProps[0].election;
  const ballotMeasureContest = find(
    specElection.contests,
    (contest): contest is YesNoContest =>
      contest.type === 'yesno' && contest.additionalOptions !== undefined
  );
  assert(ballotMeasureContest.additionalOptions!.length === 1);

  const electionAfterRender = (
    await readElection(fixtureSpec.electionPath)
  ).unsafeUnwrap().election;
  const transformedContest = find(
    electionAfterRender.contests,
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.id === ballotMeasureContest.id
  );
  expect(transformedContest.districtId).toEqual(
    ballotMeasureContest.districtId
  );
  expect(transformedContest.title).toEqual(ballotMeasureContest.title);
  expect(transformedContest.seats).toEqual(1);
  expect(transformedContest.allowWriteIns).toEqual(false);
  expect(transformedContest.termDescription).toBeUndefined();
  expect(transformedContest.candidates).toEqual([
    {
      id: ballotMeasureContest.yesOption.id,
      name: ballotMeasureContest.yesOption.label,
    },
    {
      id: ballotMeasureContest.noOption.id,
      name: ballotMeasureContest.noOption.label,
    },
    {
      id: ballotMeasureContest.additionalOptions![0].id,
      name: ballotMeasureContest.additionalOptions![0].label,
    },
  ]);
});

const templateSpecificTestProps: Record<BallotTemplateId, BaseBallotProps> = {
  VxDefaultBallot: vxGeneralElectionFixtures.fixtureSpecs[0].allBallotProps[0],
  NhBallot: nhGeneralElectionFixtures.fixtureSpecs[0].allBallotProps[0],
  MsBallot: msGeneralElectionFixtures.allBallotProps[0],
  MiBallot: miClosedPrimaryElectionFixtures.allBallotProps[0],
};
const templateSpecificTestCases = Object.entries(templateSpecificTestProps).map(
  ([templateName, ballotProps]) => ({
    templateName: templateName as BallotTemplateId,
    ballotProps,
  })
);

test.each(templateSpecificTestCases)(
  "returns contestTooLong error if contest doesn't fit on page - $templateName",
  async ({ templateName, ballotProps }) => {
    const { election, ballotStyleId } = ballotProps;
    const ballotStyle = assertDefined(
      getBallotStyle({ election, ballotStyleId })
    );
    const oversizedContest: CandidateContest = {
      id: 'contest-oversized' as ContestId,
      type: 'candidate',
      districtId: ballotStyle.districts[0],
      title: 'Oversized Contest',
      seats: 1,
      allowWriteIns: false,
      candidates: range(0, 100).map((i) => ({
        id: `candidate-${i}`,
        name: `Candidate ${i}`,
      })),
    };
    const template = ballotTemplates[templateName];
    const result = await rendererPool.runTask((renderer) =>
      renderBallotTemplate(renderer, template, {
        ...ballotProps,
        election: {
          ...election,
          contests: [...election.contests, oversizedContest],
        },
      })
    );
    expect(result.err()).toEqual({
      error: 'contestTooLong',
      contest: oversizedContest,
    });
  }
);

test.each(templateSpecificTestCases)(
  'contest options are encoded correctly - $templateName',
  async ({ templateName, ballotProps }) => {
    const template = ballotTemplates[templateName];
    const content = await rendererPool.runTask(async (renderer) => {
      const document = (
        await renderBallotTemplate(renderer, template, ballotProps)
      ).unsafeUnwrap();
      return document.getContent();
    });
    const root = parseHtml(content);

    const candidateOptionElements = root.querySelectorAll(
      `.${CANDIDATE_OPTION_CLASS}`
    );
    const candidateOptionsByContest = new Map(
      groupBy(
        candidateOptionElements.map((el) => ({
          element: el,
          optionInfo: getOptionInfoFromElement(el),
        })),
        (o) => o.optionInfo.contestId
      )
    );
    const writeInOptionsByContest = new Map(
      groupBy(
        root
          .querySelectorAll(`.${WRITE_IN_OPTION_CLASS}`)
          .map(getOptionInfoFromElement),
        (o) => o.contestId
      )
    );
    const ballotMeasureOptionsByContest = new Map(
      groupBy(
        root
          .querySelectorAll(`.${BALLOT_MEASURE_OPTION_CLASS}`)
          .map(getOptionInfoFromElement),
        (o) => o.contestId
      )
    );

    const { election } = ballotProps;
    const ballotStyle = assertDefined(
      getBallotStyle({
        election,
        ballotStyleId: ballotProps.ballotStyleId,
      })
    );
    const contests = getContests({
      election,
      ballotStyle,
    });

    expect(
      new Set([
        ...candidateOptionsByContest.keys(),
        ...writeInOptionsByContest.keys(),
        ...ballotMeasureOptionsByContest.keys(),
      ])
    ).toEqual(new Set(contests.map((c) => c.id)));

    for (const contest of contests) {
      switch (contest.type) {
        case 'candidate': {
          const renderedOptions =
            candidateOptionsByContest.get(contest.id) ?? [];
          expect(renderedOptions).toHaveLength(contest.candidates.length);

          for (const { element, optionInfo } of renderedOptions) {
            assert(optionInfo.type === 'option');
            const candidate = find(contest.candidates, (c) =>
              element.textContent.includes(c.name)
            );
            expect(optionInfo.optionId).toEqual(candidate.id);
          }

          if (contest.allowWriteIns) {
            const writeInOptions =
              writeInOptionsByContest.get(contest.id) ?? [];
            expect(writeInOptions).toHaveLength(contest.seats);
            const writeInIndices = writeInOptions.map((option) => {
              assert(option.type === 'write-in');
              return option.writeInIndex;
            });
            expect(writeInIndices).toEqual(range(0, contest.seats));
          } else {
            expect(writeInOptionsByContest.has(contest.id)).toEqual(false);
          }
          break;
        }
        case 'yesno': {
          const renderedOptions =
            ballotMeasureOptionsByContest.get(contest.id) ?? [];
          const optionIds = renderedOptions.map((option) => {
            assert(option.type === 'option');
            return option.optionId;
          });
          const expectedOptionIds = [
            contest.yesOption.id,
            contest.noOption.id,
            ...(contest.additionalOptions ?? []).map((o) => o.id),
          ];
          expect(optionIds).toEqual(expectedOptionIds);
          break;
        }
        default: {
          throwIllegalValue(contest);
        }
      }
    }
  }
);
