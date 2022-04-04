import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotPageLayout,
  BallotType,
  CandidateContest,
  HmpbBallotPageMetadata,
  unsafeParse,
  WriteInAdjudicationReasonInfo,
  WriteInId,
  WriteInIdSchema,
} from '@votingworks/types';
import {
  allContestOptions,
  assert,
  groupBy,
  typedAs,
} from '@votingworks/utils';
import React from 'react';
import { makeAppContext } from '../../test/render_in_app_context';
import { AppContext } from '../contexts/app_context';
import {
  Props as WriteInAdjudicationScreenProps,
  WriteInAdjudicationScreen,
} from './write_in_adjudication_screen';

const contestsWithWriteIns = electionSampleDefinition.election.contests.filter(
  (contest): contest is CandidateContest =>
    contest.type === 'candidate' && contest.allowWriteIns
);

function buildMetadata({
  pageNumber,
}: {
  pageNumber: number;
}): HmpbBallotPageMetadata {
  return {
    ballotStyleId: 'ballot-style-id',
    precinctId: 'precinct-id',
    ballotType: BallotType.Standard,
    electionHash: 'd34db33fd43db33f',
    isTestMode: true,
    locales: { primary: 'en-US' },
    pageNumber,
  };
}

function getWriteInOptionIds(contest: CandidateContest): WriteInId[] {
  return Array.from(allContestOptions(contest))
    .filter((option) => option.type === 'candidate' && option.isWriteIn)
    .map((option) => unsafeParse(WriteInIdSchema, option.id));
}

type onAdjudicationCompleteType = Exclude<
  WriteInAdjudicationScreenProps['onAdjudicationComplete'],
  undefined
>;

test('supports typing in a candidate name', async () => {
  const [contest] = contestsWithWriteIns;
  const [optionId] = getWriteInOptionIds(contest);
  const onAdjudicationComplete = jest
    .fn<
      ReturnType<onAdjudicationCompleteType>,
      Parameters<onAdjudicationCompleteType>
    >()
    .mockResolvedValue();

  const writeIns: WriteInAdjudicationReasonInfo[] = [
    {
      type: AdjudicationReason.MarkedWriteIn,
      contestId: contest.id,
      optionId,
      optionIndex: 0,
    },
  ];

  const layout: BallotPageLayout = {
    pageSize: { width: 1, height: 1 },
    metadata: buildMetadata({ pageNumber: 1 }),
    contests: [
      {
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        corners: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        options: [
          {
            bounds: { x: 0, y: 50, width: 100, height: 50 },
            target: {
              bounds: { x: 20, y: 60, width: 20, height: 10 },
              inner: { x: 22, y: 62, width: 16, height: 6 },
            },
          },
        ],
      },
    ],
  };

  render(
    <AppContext.Provider value={makeAppContext()}>
      <WriteInAdjudicationScreen
        key="front"
        sheetId="test-sheet"
        side="front"
        imageUrl="/test-sheet/front.jpg"
        writeIns={writeIns}
        layout={layout}
        allContestIds={[contest.id]}
        onAdjudicationComplete={onAdjudicationComplete}
      />
    </AppContext.Provider>
  );

  screen.getByText('Write-In Adjudication');
  screen.getByText(contest.title);

  userEvent.type(
    screen.getByTestId(`write-in-input-${optionId}`),
    'Lizard People'
  );

  expect(onAdjudicationComplete).not.toHaveBeenCalled();
  userEvent.click(screen.getByText('Save & Continue Scanning'));

  await waitFor(() => {
    expect(onAdjudicationComplete).toHaveBeenCalledWith(
      ...typedAs<Parameters<onAdjudicationCompleteType>>([
        'test-sheet',
        'front',
        [
          {
            type: AdjudicationReason.MarkedWriteIn,
            isMarked: true,
            contestId: contest.id,
            optionId,
            name: 'Lizard People',
          },
        ],
      ])
    );
  });
});

test('supports canceling a write-in', async () => {
  const [contest] = contestsWithWriteIns;
  const [optionId] = getWriteInOptionIds(contest);
  const onAdjudicationComplete = jest
    .fn<
      ReturnType<onAdjudicationCompleteType>,
      Parameters<onAdjudicationCompleteType>
    >()
    .mockResolvedValue();

  const writeIns: WriteInAdjudicationReasonInfo[] = [
    {
      type: AdjudicationReason.UnmarkedWriteIn,
      contestId: contest.id,
      optionId,
      optionIndex: 0,
    },
  ];

  const layout: BallotPageLayout = {
    pageSize: { width: 1, height: 1 },
    metadata: buildMetadata({ pageNumber: 1 }),
    contests: [
      {
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        corners: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        options: [
          {
            bounds: { x: 0, y: 50, width: 100, height: 50 },
            target: {
              bounds: { x: 20, y: 60, width: 20, height: 10 },
              inner: { x: 22, y: 62, width: 16, height: 6 },
            },
          },
        ],
      },
    ],
  };

  render(
    <AppContext.Provider value={makeAppContext()}>
      <WriteInAdjudicationScreen
        key="front"
        sheetId="test-sheet"
        side="front"
        imageUrl="/test-sheet/front.jpg"
        writeIns={writeIns}
        layout={layout}
        allContestIds={[contest.id]}
        onAdjudicationComplete={onAdjudicationComplete}
      />
    </AppContext.Provider>
  );

  screen.getByText('Write-In Adjudication');
  screen.getByText(contest.title);

  const isNotWriteInCheckbox = screen.getByTestId(
    `write-in-checkbox-${optionId}`
  ) as HTMLInputElement;
  expect(isNotWriteInCheckbox.checked).toBe(false);
  userEvent.click(isNotWriteInCheckbox);

  expect(onAdjudicationComplete).not.toHaveBeenCalled();
  userEvent.click(screen.getByText('Save & Continue Scanning'));

  await waitFor(() => {
    expect(onAdjudicationComplete).toHaveBeenCalledWith(
      ...typedAs<Parameters<onAdjudicationCompleteType>>([
        'test-sheet',
        'front',
        [
          {
            type: AdjudicationReason.UnmarkedWriteIn,
            isMarked: false,
            contestId: contest.id,
            optionId,
          },
        ],
      ])
    );
  });
});

test('can adjudicate front & back in succession', async () => {
  const [frontContest1, frontContest2, backContest] = contestsWithWriteIns;
  assert(frontContest1 && frontContest2 && backContest);
  const frontContest1WriteInId = getWriteInOptionIds(frontContest1)[0];
  const frontContest2WriteInId = getWriteInOptionIds(frontContest2)[0];
  const backContestWriteInId = getWriteInOptionIds(backContest)[0];
  assert(
    typeof frontContest1WriteInId === 'string' &&
      typeof frontContest2WriteInId === 'string' &&
      typeof backContestWriteInId === 'string'
  );
  const frontMetadata = buildMetadata({ pageNumber: 1 });
  const backMetadata = buildMetadata({ pageNumber: 2 });
  const onAdjudicationComplete = jest
    .fn<
      ReturnType<onAdjudicationCompleteType>,
      Parameters<onAdjudicationCompleteType>
    >()
    .mockResolvedValue();

  const frontWriteIns: WriteInAdjudicationReasonInfo[] = [
    {
      type: AdjudicationReason.MarkedWriteIn,
      contestId: frontContest1.id,
      optionId: frontContest1WriteInId,
      optionIndex: 0,
    },
    {
      type: AdjudicationReason.MarkedWriteIn,
      contestId: frontContest2.id,
      optionId: frontContest2WriteInId,
      optionIndex: 0,
    },
  ];

  const backWriteIns: WriteInAdjudicationReasonInfo[] = [
    {
      type: AdjudicationReason.MarkedWriteIn,
      contestId: backContest.id,
      optionId: backContestWriteInId,
      optionIndex: 0,
    },
  ];

  const frontLayout: BallotPageLayout = {
    pageSize: { width: 1, height: 1 },
    metadata: frontMetadata,
    contests: [frontContest1, frontContest2].map(() => ({
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      corners: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      options: [
        {
          bounds: { x: 0, y: 50, width: 100, height: 50 },
          target: {
            bounds: { x: 20, y: 60, width: 20, height: 10 },
            inner: { x: 22, y: 62, width: 16, height: 6 },
          },
        },
      ],
    })),
  };

  const backLayout: BallotPageLayout = {
    pageSize: { width: 1, height: 1 },
    metadata: backMetadata,
    contests: [backContest].map(() => ({
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      corners: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      options: [
        {
          bounds: { x: 0, y: 50, width: 100, height: 50 },
          target: {
            bounds: { x: 20, y: 60, width: 20, height: 10 },
            inner: { x: 22, y: 62, width: 16, height: 6 },
          },
        },
      ],
    })),
  };

  const appContext = makeAppContext();

  const { rerender } = render(
    <AppContext.Provider value={appContext}>
      <WriteInAdjudicationScreen
        key="front"
        sheetId="test-sheet"
        side="front"
        imageUrl="/test-sheet/front.jpg"
        writeIns={frontWriteIns}
        layout={frontLayout}
        allContestIds={[frontContest1.id, frontContest2.id]}
        onAdjudicationComplete={onAdjudicationComplete}
      />
    </AppContext.Provider>
  );

  screen.getByText('Write-In Adjudication');
  screen.getByText(frontContest1.title);

  {
    const isNotWriteInCheckbox = screen.getByTestId(
      `write-in-checkbox-${frontContest1WriteInId}`
    ) as HTMLInputElement;
    expect(isNotWriteInCheckbox.checked).toBe(false);
    userEvent.click(isNotWriteInCheckbox);
  }

  userEvent.click(screen.getByText('Next Contest'));
  screen.getByText(frontContest2.title);

  {
    const isNotWriteInCheckbox = screen.getByTestId(
      `write-in-checkbox-${frontContest1WriteInId}`
    ) as HTMLInputElement;
    expect(isNotWriteInCheckbox.checked).toBe(false);
    userEvent.click(isNotWriteInCheckbox);
  }

  userEvent.click(screen.getByText('Save & Continue Scanning'));

  await waitFor(() => {
    expect(onAdjudicationComplete).toHaveBeenCalled();
  });

  rerender(
    <AppContext.Provider value={appContext}>
      <WriteInAdjudicationScreen
        key="back"
        sheetId="test-sheet"
        side="back"
        imageUrl="/test-sheet/back.jpg"
        writeIns={backWriteIns}
        layout={backLayout}
        allContestIds={[backContest.id]}
        onAdjudicationComplete={onAdjudicationComplete}
      />
    </AppContext.Provider>
  );

  await waitFor(() => {
    screen.getByText(backContest.title);
  });

  {
    const isNotWriteInCheckbox = screen.getByTestId(
      `write-in-checkbox-${backContestWriteInId}`
    ) as HTMLInputElement;
    expect(isNotWriteInCheckbox.checked).toBe(false);
    userEvent.click(isNotWriteInCheckbox);
  }

  userEvent.click(screen.getByText('Save & Continue Scanning'));

  await waitFor(() => {
    expect(onAdjudicationComplete).toHaveBeenCalledTimes(2);
  });
});

test('uses the layout embedded definition to crop the ballot image correctly if available', async () => {
  const [contest] = contestsWithWriteIns.filter(({ seats }) => seats > 1);
  const options = Array.from(allContestOptions(contest));
  const optionsByIsWriteIn = groupBy(
    options,
    (option) => option.type === 'candidate' && option.isWriteIn
  );
  const maximumWriteInOptionIndex = Math.max(
    ...Array.from(optionsByIsWriteIn.get(true)!).map(
      ({ optionIndex }) => optionIndex
    )
  );
  const optionsWithReversedWriteIns = [...options].sort((a, b) => {
    if (a.type !== 'candidate' || b.type !== 'candidate') {
      return -1;
    }

    if (a.isWriteIn !== b.isWriteIn) {
      return -1;
    }

    return b.optionIndex - a.optionIndex;
  });

  // Use the first write-in space, which is the last one in the definition list.
  const writeInOption = optionsWithReversedWriteIns.find(
    (option) => option.type === 'candidate' && option.isWriteIn
  )!;
  const onAdjudicationComplete = jest
    .fn<
      ReturnType<onAdjudicationCompleteType>,
      Parameters<onAdjudicationCompleteType>
    >()
    .mockResolvedValue();

  const writeIns: WriteInAdjudicationReasonInfo[] = [
    {
      type: AdjudicationReason.MarkedWriteIn,
      contestId: writeInOption.contestId,
      optionId: writeInOption.id,
      // You'd expect this to be `writeInOption.optionIndex`, but because
      // `allContestOptions` doesn't know the write-ins are reversed, it will
      // return the write-in options in the wrong order. So this is set to the
      // last write-in option index because that's where `allContestOptions`
      // puts the write-in we're looking for.
      optionIndex: maximumWriteInOptionIndex,
    },
  ];

  const layout: BallotPageLayout = {
    pageSize: { width: 1, height: 1 },
    metadata: buildMetadata({ pageNumber: 1 }),
    contests: [
      {
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        corners: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        options: optionsWithReversedWriteIns.map((option, i) => ({
          definition: option,
          bounds: { x: 0, y: 200 + 50 * i, width: 100, height: 50 },
          target: {
            bounds: { x: 20, y: 200 + 50 * i + 10, width: 20, height: 10 },
            inner: { x: 22, y: 200 + 50 * i + 12, width: 16, height: 6 },
          },
        })),
      },
    ],
  };

  render(
    <AppContext.Provider value={makeAppContext()}>
      <WriteInAdjudicationScreen
        key="front"
        sheetId="test-sheet"
        side="front"
        imageUrl="/test-sheet/front.jpg"
        writeIns={writeIns}
        layout={layout}
        allContestIds={[contest.id]}
        onAdjudicationComplete={onAdjudicationComplete}
      />
    </AppContext.Provider>
  );

  screen.getByText('Write-In Adjudication');
  screen.getByText(contest.title);

  const writeInImage = screen.getByAltText('write-in area');
  expect(writeInImage.dataset.crop).toMatchInlineSnapshot(
    `"x=0, y=185, width=100, height=80"`
  );
});
