import { afterAll, beforeAll, expect, test } from 'vitest';
import { assertDefined, find, iter } from '@votingworks/basics';
import {
  BallotStyle,
  Candidate,
  Election,
  getContests,
} from '@votingworks/types';
import {
  parse as parseHtml,
  HTMLElement as ParsedHTMLElement,
} from 'node-html-parser';
import { nhStateGeneralElectionFixtures } from './ballot_fixtures.js';
import { createPlaywrightRendererPool } from './playwright_renderer.js';
import { RendererPool } from './renderer.js';
import { renderBallotTemplate } from './render_ballot.js';
import { ballotTemplates } from './ballot_templates/index.js';
import {
  isDemocraticParty,
  isRepublicanParty,
  NhStateBallotProps,
} from './ballot_templates/nh_state_ballot_components.js';

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});
afterAll(async () => {
  await rendererPool.close();
});

const baseProps = assertDefined(
  nhStateGeneralElectionFixtures.allBallotProps[0]
);
const baseElection = baseProps.election;
const democraticPartyId = find(baseElection.parties, isDemocraticParty).id;
const republicanPartyId = find(baseElection.parties, isRepublicanParty).id;

type CandidateColumn = 'democratic' | 'republican' | 'other';

function columnOf(candidate: Candidate): CandidateColumn {
  switch (candidate.partyIds?.[0]) {
    case democraticPartyId:
      return 'democratic';
    case republicanPartyId:
      return 'republican';
    default:
      return 'other';
  }
}

function withCandidateOrder(
  election: Election,
  orderCandidates: (
    candidates: readonly Candidate[],
    contestIndex: number
  ) => readonly Candidate[]
): Election {
  return {
    ...election,
    ballotStyles: election.ballotStyles.map((ballotStyle) => ({
      ...ballotStyle,
      orderedCandidatesByContest: Object.fromEntries(
        getContests({ election, ballotStyle })
          .filter((contest) => contest.type === 'candidate')
          .map((contest, contestIndex) => [
            contest.id,
            orderCandidates(contest.candidates, contestIndex).map(
              (candidate) => ({
                id: candidate.id,
                partyIds: candidate.partyIds,
              })
            ),
          ])
      ),
    })),
  };
}

async function renderFirstPage(
  props: NhStateBallotProps
): Promise<ParsedHTMLElement> {
  const content = await rendererPool.runTask(async (renderer) => {
    const document = (
      await renderBallotTemplate(renderer, ballotTemplates.NhStateBallot, props)
    ).unsafeUnwrap();
    return await document.getContent();
  });
  return parseHtml(content);
}

function sectionHeadings(root: ParsedHTMLElement): string[] {
  const officesCell = assertDefined(
    root.querySelectorAll('div').find((div) => div.text === 'Offices')
  );
  const sectionHeader = assertDefined(
    officesCell.parentNode as ParsedHTMLElement | null
  );
  return sectionHeader.childNodes
    .filter(
      (node): node is ParsedHTMLElement => node instanceof ParsedHTMLElement
    )
    .map((node) => node.text.replace(/\s+/g, ' ').trim());
}

function candidateColumnsInDomOrder(
  root: ParsedHTMLElement
): CandidateColumn[] {
  const contest = find(
    getContests({
      election: baseElection,
      ballotStyle: assertDefined(baseElection.ballotStyles[0]),
    }),
    (c) => c.type === 'candidate' && c.candidates.length >= 3
  );
  const candidatesById = new Map(
    (contest.type === 'candidate' ? contest.candidates : []).map(
      (candidate) => [candidate.id, candidate]
    )
  );
  return iter(root.querySelectorAll('[data-option-info]'))
    .map((element) =>
      JSON.parse(assertDefined(element.getAttribute('data-option-info')))
    )
    .filter(
      (optionInfo) =>
        optionInfo.type === 'option' && optionInfo.contestId === contest.id
    )
    .map((optionInfo) =>
      columnOf(assertDefined(candidatesById.get(optionInfo.optionId)))
    )
    .toArray();
}

test.each([
  {
    label: 'democratic, republican, other',
    rank: { democratic: 0, republican: 1, other: 2 },
    expectedOrder: ['democratic', 'republican', 'other'],
  },
  {
    label: 'republican, democratic, other',
    rank: { democratic: 1, republican: 0, other: 2 },
    expectedOrder: ['republican', 'democratic', 'other'],
  },
  {
    label: 'other, republican, democratic',
    rank: { democratic: 2, republican: 1, other: 0 },
    expectedOrder: ['other', 'republican', 'democratic'],
  },
])(
  'party columns follow the ballot style candidate order - $label',
  async ({ rank, expectedOrder }) => {
    const election = withCandidateOrder(baseElection, (candidates) =>
      [...candidates].sort((a, b) => rank[columnOf(a)] - rank[columnOf(b)])
    );
    const root = await renderFirstPage({ ...baseProps, election });

    const headingsByColumn: Record<CandidateColumn, string> = {
      democratic: 'Democratic Candidates',
      republican: 'Republican Candidates',
      other: 'Other Candidates',
    };
    expect(sectionHeadings(root)).toEqual([
      'Offices',
      ...expectedOrder.map(
        (column) => headingsByColumn[column as CandidateColumn]
      ),
      'Write-in Candidates',
    ]);
    expect(candidateColumnsInDomOrder(root)).toEqual(expectedOrder);
  }
);

test('party columns keep their default order when no contest lists two of them together', async () => {
  const columnsByIndex: CandidateColumn[] = [
    'democratic',
    'republican',
    'other',
  ];
  const election = withCandidateOrder(
    baseElection,
    (candidates, contestIndex) => {
      const column = assertDefined(
        columnsByIndex[contestIndex % columnsByIndex.length]
      );
      return candidates.filter((candidate) => columnOf(candidate) === column);
    }
  );
  const root = await renderFirstPage({ ...baseProps, election });

  expect(sectionHeadings(root)).toEqual([
    'Offices',
    'Democratic Candidates',
    'Republican Candidates',
    'Other Candidates',
    'Write-in Candidates',
  ]);
});

test('header omits the precinct name when the election has a single precinct', async () => {
  const ballotStyle = assertDefined(
    baseElection.ballotStyles.find(
      (style: BallotStyle) => style.precincts.length === 1
    )
  );
  const precinctId = assertDefined(ballotStyle.precincts[0]);
  const election: Election = {
    ...baseElection,
    precincts: baseElection.precincts.filter(
      (precinct) => precinct.id === precinctId
    ),
    ballotStyles: [ballotStyle],
  };
  const root = await renderFirstPage({
    ...baseProps,
    election,
    ballotStyleId: ballotStyle.id,
    precinctId,
  });

  const jurisdictionHeading = assertDefined(root.querySelector('h1'));
  expect(jurisdictionHeading.text).toEqual(baseElection.jurisdiction.name);
  expect(jurisdictionHeading.getAttribute('style')).toContain('18pt');
});

test('header names the precinct alongside the jurisdiction in a multi-precinct election', async () => {
  const root = await renderFirstPage(baseProps);

  const precinct = find(
    baseElection.precincts,
    (p) => p.id === baseProps.precinctId
  );
  const jurisdictionHeading = assertDefined(root.querySelector('h1'));
  expect(jurisdictionHeading.text).toEqual(
    `${baseElection.jurisdiction.name} ${precinct.name}`
  );
  expect(jurisdictionHeading.getAttribute('style')).toContain('15pt');
});
