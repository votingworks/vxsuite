import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { afterAll, beforeAll, test, expect } from 'vitest';
import {
  BALLOT_MODES,
  BallotType,
  type BaseBallotProps,
  type CandidateContest,
  type Election,
  getBallotStyle,
  getContests,
  LanguageCode,
  type YesNoContest,
  LATEST_SOFTWARE_VERSION,
  straightPartyNotYetImplemented,
  convertLatestElectionToV4p0,
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
  safeParseJson,
  BallotPositionsSchema,
  ElectionPackageFileName,
  type BallotPositions,
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
  type HTMLElement as ParsedHTMLElement,
} from 'node-html-parser';
import { readFileSync } from 'node:fs';
import {
  parseAndHashElection,
  withElectionPackageZip,
} from '@votingworks/backend';
import { zipFile } from '@votingworks/test-utils';
import {
  allBaseBallotProps,
  layOutBallotsAndCreateElectionDefinition,
  layOutMinimalBallotsToCreateElectionDefinition,
  renderAllBallotPdfsAndCreateElectionDefinition,
  type ScratchDir,
} from './render_ballot.js';
import { renderBallotTemplate } from './render_common.js';
import { createPlaywrightRendererPool } from './playwright_renderer.js';
import type { RendererPool } from './renderer.js';
import {
  type BallotTemplateId,
  ballotTemplates,
  type NhStateBallotProps,
} from './ballot_templates/index.js';
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
  type OptionInfo,
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

  const someBallotStyle = election.ballotStyles[0]!;
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
      DEFAULT_SYSTEM_SETTINGS,
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
    DEFAULT_SYSTEM_SETTINGS,
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
    DEFAULT_SYSTEM_SETTINGS,
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
  const fixtureSpec = nhGeneralElectionFixtures.fixtureSpecs[0]!;
  // allBallotProps[0].election has the 3-option question-a contest
  const specElection = fixtureSpec.allBallotProps[0]!.election;
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
      DEFAULT_SYSTEM_SETTINGS,
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
  const fixtureSpec = nhGeneralElectionFixtures.fixtureSpecs[0]!;
  const specElection = fixtureSpec.allBallotProps[0]!.election;
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
      DEFAULT_SYSTEM_SETTINGS,
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
    vxGeneralElectionFixtures.fixtureSpecs[0]!.allBallotProps[0]!,
  ],
  NhBallot: [nhGeneralElectionFixtures.fixtureSpecs[0]!.allBallotProps[0]!],
  NhStateBallot: [
    nhStateGeneralElectionFixtures.allBallotProps[0]!,
    nhStatePrimaryElectionFixtures.allBallotProps[0]!,
  ],
  MsBallot: [msGeneralElectionFixtures.allBallotProps[0]!],
  MiBallot: [miClosedPrimaryElectionFixtures.allBallotProps[0]!],
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
      districtId: ballotStyle.districts[0]!,
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
    ...vxGeneralElectionFixtures.fixtureSpecs[0]!.allBallotProps[0]!,
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
    DEFAULT_SYSTEM_SETTINGS,
    makeScratchDir()
  );

  await expect(res).rejects.toThrow(/multiple distinct ballot positions/);
});

test('writes separate ballot meta files when `splitElectionDefinition` setting is on', async () => {
  const fixtures = vxGeneralElectionFixtures;
  const allProps = assertDefined(fixtures.fixtureSpecs[0]?.allBallotProps);

  const props1 = assertDefined(allProps[0]);
  const props2 = find(
    allProps,
    (p) => p.ballotStyleId !== props1.ballotStyleId
  );

  const settings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    splitElectionDefinition: true,
  };

  const res = await renderAllBallotPdfsAndCreateElectionDefinition(
    rendererPool,
    vxDefaultBallotTemplate,
    [props1, props2],
    { compact: true, format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    settings,
    makeScratchDir()
  );

  for (const bs of res.electionDefinition.election.ballotStyles) {
    expect(bs.ballotPositions).toBeUndefined();
  }

  const ballotPositionsJsonl = loadPositionsJsonl(res.ballotPositionsPath);
  const ballotPositions = parsePositionsJsonl(ballotPositionsJsonl);

  expect(ballotPositions[0]?.ballotStyleId).toEqual(props1.ballotStyleId);
  expect(ballotPositions[1]?.ballotStyleId).toEqual(props2.ballotStyleId);

  // Make sure ballot hashes match after round trip through ZIP package:

  const zipData = await zipFile({
    [ElectionPackageFileName.ELECTION]: res.electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(settings),
    [ElectionPackageFileName.BALLOT_POSITIONS]: ballotPositionsJsonl,
  });

  const zipFilePath = makeTemporaryFile({ content: zipData });
  const parsedElection = await withElectionPackageZip(zipFilePath, (zip) =>
    parseAndHashElection(zip, settings)
  );

  const { ballotHash } = res.electionDefinition;
  expect(parsedElection.unsafeUnwrap().ballotHash).toEqual(ballotHash);

  // Expect an unindented election.json when the `compact` option is enabled.
  expect(res.electionDefinition.electionData).not.toContain('\n');
});

test('writes single-file election when `splitElectionDefinition` setting is off', async () => {
  const fixtures = vxGeneralElectionFixtures;
  const props = assertDefined(fixtures.fixtureSpecs[0]?.allBallotProps);

  const props1 = assertDefined(props[0]);
  const props2 = find(props, (p) => p.ballotStyleId !== props1.ballotStyleId);

  const settings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    splitElectionDefinition: false,
  };

  const res = await renderAllBallotPdfsAndCreateElectionDefinition(
    rendererPool,
    vxDefaultBallotTemplate,
    [props1, props2],
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    settings,
    makeScratchDir()
  );

  const { ballotHash, election } = res.electionDefinition;

  function expectBallotStylePositions(styleId: string) {
    const style = find(election.ballotStyles, (bs) => bs.id === styleId);
    expect(style.ballotPositions?.length).greaterThan(0);
  }

  expectBallotStylePositions(props1.ballotStyleId);
  expectBallotStylePositions(props2.ballotStyleId);
  expect(res.ballotPositionsPath).toBeUndefined();

  // Make sure ballot hashes match after round trip through ZIP package:

  const zipData = await zipFile({
    [ElectionPackageFileName.ELECTION]: res.electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(settings),
  });

  const zipFilePath = makeTemporaryFile({ content: zipData });
  const parsedElection = await withElectionPackageZip(zipFilePath, (zip) =>
    parseAndHashElection(zip, settings)
  );

  expect(parsedElection.unsafeUnwrap().ballotHash).toEqual(ballotHash);
});

test('omits ballot positions for non-scannable documents', async () => {
  const fixtures = vxGeneralElectionFixtures;
  const props = assertDefined(fixtures.fixtureSpecs[0]?.allBallotProps);

  const props1: NhStateBallotProps = { ...props[0]!, isHandCount: true };
  const props2 = find(props, (p) => p.ballotStyleId !== props1.ballotStyleId);

  const settings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    splitElectionDefinition: true,
  };

  const res = await layOutBallotsAndCreateElectionDefinition(
    rendererPool,
    vxDefaultBallotTemplate,
    [props1, props2],
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    settings,
    makeScratchDir()
  );

  const ballotPositionsJsonl = loadPositionsJsonl(res.ballotPositionsPath);
  const ballotPositions = parsePositionsJsonl(ballotPositionsJsonl);
  expect(ballotPositions).toHaveLength(1);
  expect(ballotPositions[0]?.ballotStyleId).toEqual(props2.ballotStyleId);
});

function makeScratchDir(): ScratchDir {
  return { path: makeTemporaryDirectory() };
}

function loadPositionsJsonl(filePath?: string): string {
  assert(!!filePath, 'missing ballot positions path');
  return readFileSync(filePath, 'utf8');
}

function parsePositionsJsonl(jsonl: string): BallotPositions[] {
  return jsonl
    .trim()
    .split('\n')
    .map((l) => safeParseJson(l, BallotPositionsSchema).unsafeUnwrap());
}
