import {
  electionFamousNames2021Fixtures,
  electionGeneralFixtures,
} from '@votingworks/fixtures';
import { test, expect } from 'vitest';
import {
  BALLOT_MODES,
  BallotType,
  BaseBallotProps,
  CandidateContest,
  ContestId,
  Election,
  LanguageCode,
  YesNoContest,
} from '@votingworks/types';
import { assert, assertDefined, find, iter, range } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import { parse as parseHtml } from 'node-html-parser';
import {
  allBaseBallotProps,
  layOutMinimalBallotsToCreateElectionDefinition,
  renderBallotTemplate,
} from './render_ballot';
import {
  createPlaywrightRenderer,
  createPlaywrightRendererPool,
} from './playwright_renderer';
import { ballotTemplates } from './ballot_templates';
import {
  nhGeneralElectionFixtures,
  vxFamousNamesFixtures,
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
  const rendererPool = await createPlaywrightRendererPool();
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
  const rendererPool = await createPlaywrightRendererPool();
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

test('contest options are encoded correctly', async () => {
  const electionDefinition = electionGeneralFixtures.readElectionDefinition();
  const allBallotProps = allBaseBallotProps(electionDefinition.election);
  const renderer = await createPlaywrightRenderer();
  const document = (
    await renderBallotTemplate(
      renderer,
      ballotTemplates.VxDefaultBallot,
      allBallotProps[0]
    )
  ).unsafeUnwrap();
  const content = await document.getContent();
  await renderer.close();
  const root = parseHtml(content);

  const candidateOptions = root.querySelectorAll(`.${CANDIDATE_OPTION_CLASS}`);
  expect(candidateOptions.length).toBeGreaterThan(0);
  for (const candidateOption of candidateOptions) {
    const { textContent } = candidateOption;
    const contest = find(
      electionDefinition.election.contests,
      (c): c is CandidateContest =>
        c.type === 'candidate' &&
        c.candidates.some((candidate) => textContent.includes(candidate.name))
    );
    const candidate = find(contest.candidates, (c) =>
      textContent.includes(c.name)
    );
    expect(candidate).toBeDefined();
    const bubbleElement = assertDefined(
      candidateOption.querySelector(`.${BUBBLE_CLASS}`)
    );
    const optionInfo = JSON.parse(
      bubbleElement.getAttribute('data-option-info')!
    ) as OptionInfo;
    assert(optionInfo.type === 'option');
    expect(optionInfo.contestId).toEqual(contest.id);
    expect(optionInfo.optionId).toEqual(candidate.id);
  }

  const writeInOptions = root.querySelectorAll(`.${WRITE_IN_OPTION_CLASS}`);
  expect(writeInOptions.length).toBeGreaterThan(0);
  const writeInOptionsByContest = new Map<ContestId, OptionInfo[]>();
  for (const writeInOption of writeInOptions) {
    const bubbleElement = assertDefined(
      writeInOption.querySelector(`.${BUBBLE_CLASS}`)
    );
    const optionInfo = JSON.parse(
      bubbleElement.getAttribute('data-option-info')!
    ) as OptionInfo;
    assert(optionInfo.type === 'write-in');
    const contest = find(
      electionDefinition.election.contests,
      (c): c is CandidateContest =>
        c.type === 'candidate' && c.id === optionInfo.contestId
    );
    const options = writeInOptionsByContest.get(contest.id) ?? [];
    options.push(optionInfo);
    writeInOptionsByContest.set(contest.id, options);
  }
  for (const [contestId, contestWriteInOptions] of writeInOptionsByContest) {
    const contest = find(
      electionDefinition.election.contests,
      (c): c is CandidateContest => c.type === 'candidate' && c.id === contestId
    );
    expect(contestWriteInOptions).toHaveLength(contest.seats);
    const writeInIndices = contestWriteInOptions.map((option) => {
      assert(option.type === 'write-in');
      return option.writeInIndex;
    });
    expect(writeInIndices).toEqual(range(0, contest.seats));
  }

  const ballotMeasureOptions = root.querySelectorAll(
    `.${BALLOT_MEASURE_OPTION_CLASS}`
  );
  expect(ballotMeasureOptions.length).toBeGreaterThan(0);
  const ballotMeasureOptionsByContest = new Map<ContestId, OptionInfo[]>();
  for (const ballotMeasureOption of ballotMeasureOptions) {
    const bubbleElement = assertDefined(
      ballotMeasureOption.querySelector(`.${BUBBLE_CLASS}`)
    );
    const optionInfo = JSON.parse(
      bubbleElement.getAttribute('data-option-info')!
    ) as OptionInfo;
    assert(optionInfo.type === 'option');
    const contest = find(
      electionDefinition.election.contests,
      (c): c is YesNoContest =>
        c.type === 'yesno' && c.id === optionInfo.contestId
    );
    const options = ballotMeasureOptionsByContest.get(contest.id) ?? [];
    options.push(optionInfo);
    ballotMeasureOptionsByContest.set(contest.id, options);
  }
  for (const [
    contestId,
    contestBallotMeasureOptions,
  ] of ballotMeasureOptionsByContest) {
    const contest = find(
      electionDefinition.election.contests,
      (c): c is YesNoContest => c.type === 'yesno' && c.id === contestId
    );
    const optionIds = contestBallotMeasureOptions.map((option) => {
      assert(option.type === 'option');
      return option.optionId;
    });
    expect(optionIds).toEqual([contest.yesOption.id, contest.noOption.id]);
  }
});
