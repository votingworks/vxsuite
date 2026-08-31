import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { afterAll, beforeAll, test, expect } from 'vitest';
import {
  BALLOT_MODES,
  BallotType,
  BaseBallotProps,
  CandidateContest,
  Election,
  getBallotStyle,
  getContests,
  LanguageCode,
  YesNoContest,
  LATEST_SOFTWARE_VERSION,
  straightPartyNotYetImplemented,
  convertLatestElectionToV4p0,
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
import {
  parse as parseHtml,
  HTMLElement as ParsedHTMLElement,
} from 'node-html-parser';
import {
  allBaseBallotProps,
  layOutBallotsAndCreateElectionDefinition,
  layOutMinimalBallotsToCreateElectionDefinition,
  renderBallotTemplate,
  ScratchDir,
} from './render_ballot.js';
import { createPlaywrightRendererPool } from './playwright_renderer.js';
import { RendererPool } from './renderer.js';
import { BallotTemplateId, ballotTemplates } from './ballot_templates/index.js';
import {
  miClosedPrimaryElectionFixtures,
  msGeneralElectionFixtures,
  nhGeneralElectionFixtures,
  nhStateGeneralElectionFixtures,
  nhStatePrimaryElectionFixtures,
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
} from './ballot_fixtures.js';
import { rotateCandidatesByStatute } from './ballot_templates/nh_ballot_template.js';
import { generateBallotStyles } from './ballot_styles.js';
import {
  BALLOT_MEASURE_OPTION_CLASS,
  BUBBLE_CLASS,
  CANDIDATE_OPTION_CLASS,
  OptionInfo,
  WRITE_IN_OPTION_CLASS,
} from './ballot_components.js';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template.js';

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
      { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
      makeScratchDir()
    );
  expect(electionDefinition).toEqual(fixtureElectionDefinition);
});

test('rendered ballot can convert to v4p0 election', async () => {
  const fixtureElectionDefinition = vxFamousNamesFixtures.electionDefinition;
  const allBallotProps = allBaseBallotProps(fixtureElectionDefinition.election);
  const { election } = await layOutMinimalBallotsToCreateElectionDefinition(
    rendererPool,
    ballotTemplates.VxDefaultBallot,
    allBallotProps,
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    makeScratchDir()
  );

  // Verify at least one ballot style has ballotPositions (i.e., the renderer
  // is actually producing them — a missing field would make this test vacuous).
  const stylesWithPositions = election.ballotStyles.filter(
    (bs) => bs.ballotPositions && bs.ballotPositions.length > 0
  );
  expect(stylesWithPositions.length).toBeGreaterThan(0);

  // This will throw if any ballot style has non-uniform option bounds.
  expect(() => convertLatestElectionToV4p0(election)).not.toThrow();
});

test('reorder candidates based on rotation from template', async () => {
  const baseElection = vxFamousNamesFixtures.electionDefinition.election;
  const fixtureElection: Election = {
    ...baseElection,
    ballotStyles: generateBallotStyles({
      ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
      electionId: baseElection.id,
      electionType: baseElection.type,
      isMiCombinedBallotPrimary: false,
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
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    makeScratchDir()
  );

  const { contests: fixtureContests, ...restFixtureElection } = fixtureElection;
  const { contests, ...restElection } = election;

  // Ballot positions are generated during layout, so strip them from the
  // ballot styles before comparing against the fixture election.
  function withoutBallotPositions(e: typeof restElection) {
    return {
      ...e,
      ballotStyles: e.ballotStyles.map(
        ({ ballotPositions: _ballotPositions, ...ballotStyle }) => ballotStyle
      ),
    };
  }

  expect(withoutBallotPositions(restElection)).toEqual(
    withoutBallotPositions(restFixtureElection)
  );
  for (const [contest, fixtureContest] of iter(contests).zip(fixtureContests)) {
    assert(contest.id === fixtureContest.id);
    assert(contest.type === 'candidate');
    assert(fixtureContest.type === 'candidate');
    const { candidates, ...restContest } = contest;
    const { candidates: _fixtureCandidates, ...restFixtureContest } =
      fixtureContest;
    expect(restContest).toEqual(restFixtureContest);
    expect(candidates.map((c) => c.id)).toEqual(
      rotateCandidatesByStatute(fixtureContest).map((c) => c.id)
    );
  }
});

test('v4.1: ballot measure contests with 3+ options are exported natively as yesno', async () => {
  const fixtureSpec = nhGeneralElectionFixtures.fixtureSpecs[0];
  // allBallotProps[0].election has the 3-option question-a contest
  const specElection = fixtureSpec.allBallotProps[0].election;
  const ballotMeasureContest = find(
    specElection.contests,
    (contest): contest is YesNoContest =>
      contest.type === 'yesno' && contest.options.length > 2
  );
  assert(ballotMeasureContest.options.length === 3);

  // Use allBaseBallotProps to get same-reference election objects for all props
  const allBallotProps = allBaseBallotProps(specElection);

  // v4.1+ exports the contest natively — it stays as a yesno with all options.
  const electionDefinitionV41 =
    await layOutMinimalBallotsToCreateElectionDefinition(
      rendererPool,
      ballotTemplates.NhBallot,
      allBallotProps,
      { format: 'vxf', version: 'v4.1' },
      makeScratchDir()
    );
  const nativeContest = find(
    electionDefinitionV41.election.contests,
    (contest): contest is YesNoContest =>
      contest.type === 'yesno' && contest.id === ballotMeasureContest.id
  );
  expect(nativeContest.options).toHaveLength(3);
  expect(nativeContest.options.map((o) => o.id)).toEqual(
    ballotMeasureContest.options.map((o) => o.id)
  );
});

test('v4.0: ballot measure contests with 3+ options are transformed into candidate contests', async () => {
  const fixtureSpec = nhGeneralElectionFixtures.fixtureSpecs[0];
  const specElection = fixtureSpec.allBallotProps[0].election;
  const ballotMeasureContest = find(
    specElection.contests,
    (contest): contest is YesNoContest =>
      contest.type === 'yesno' && contest.options.length > 2
  );
  assert(ballotMeasureContest.options.length === 3);

  // Use allBaseBallotProps to get same-reference election objects for all props
  const allBallotProps = allBaseBallotProps(specElection);

  // v4.0 can't represent >2-option yesno contests, so the renderer converts
  // them to candidate contests for backwards-compatible export.
  const electionDefinitionV40 =
    await layOutMinimalBallotsToCreateElectionDefinition(
      rendererPool,
      ballotTemplates.NhBallot,
      allBallotProps,
      { format: 'vxf', version: 'v4.0' },
      makeScratchDir()
    );
  const transformedContest = find(
    electionDefinitionV40.election.contests,
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.id === ballotMeasureContest.id
  );
  expect(transformedContest.title).toEqual(ballotMeasureContest.title);
  expect(transformedContest.seats).toEqual(1);
  expect(transformedContest.allowWriteIns).toEqual(false);
  expect(transformedContest.candidates).toEqual(
    ballotMeasureContest.options.map((option) => ({
      id: option.id,
      name: option.label,
    }))
  );
});

const templateSpecificTestProps: Record<BallotTemplateId, BaseBallotProps[]> = {
  VxDefaultBallot: [
    vxGeneralElectionFixtures.fixtureSpecs[0].allBallotProps[0],
  ],
  NhBallot: [nhGeneralElectionFixtures.fixtureSpecs[0].allBallotProps[0]],
  NhStateBallot: [
    nhStateGeneralElectionFixtures.allBallotProps[0],
    nhStatePrimaryElectionFixtures.allBallotProps[0],
  ],
  MsBallot: [msGeneralElectionFixtures.allBallotProps[0]],
  MiBallot: [miClosedPrimaryElectionFixtures.allBallotProps[0]],
};
const templateSpecificTestCases = Object.entries(
  templateSpecificTestProps
).flatMap(([templateName, props]) =>
  props.map((ballotProps, index) => ({
    templateName: templateName as BallotTemplateId,
    ballotProps,
    index: index + 1,
  }))
);

test.each(templateSpecificTestCases)(
  "returns contestTooLong error if contest doesn't fit on page - $templateName ($index)",
  async ({ templateName, ballotProps }) => {
    const { election, ballotStyleId } = ballotProps;
    const ballotStyle = assertDefined(
      getBallotStyle({ election, ballotStyleId })
    );
    const oversizedContest: CandidateContest = {
      id: 'contest-oversized',
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
  'contest options are encoded correctly - $templateName ($index)',
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
      /* istanbul ignore next */
      if (contest.type === 'straight-party') {
        straightPartyNotYetImplemented();
      }
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
          const expectedOptionIds = contest.options.map((o) => o.id);
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

test('fails on inconsistent ballot positions for matching styles', async () => {
  const baseProps: BaseBallotProps = {
    ...vxGeneralElectionFixtures.fixtureSpecs[0].allBallotProps[0],
    compact: false,
  };

  const conflictingProps: BaseBallotProps = {
    ...baseProps,
    compact: true,
  };

  const res = layOutBallotsAndCreateElectionDefinition(
    rendererPool,
    vxDefaultBallotTemplate,
    [baseProps, conflictingProps],
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    makeScratchDir()
  );

  await expect(res).rejects.toThrow(/multiple distinct ballot positions/);
});

function makeScratchDir(): ScratchDir {
  return { path: makeTemporaryDirectory() };
}
