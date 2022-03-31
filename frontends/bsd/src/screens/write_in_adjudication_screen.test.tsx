import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  UnmarkedWriteInAdjudicationReasonInfo,
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

import { allContestOptions, assert, typedAs } from '@votingworks/utils';
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

  const writeIns: Array<
    WriteInAdjudicationReasonInfo | UnmarkedWriteInAdjudicationReasonInfo
  > = [
    {
      type: AdjudicationReason.WriteIn,
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
        sheetId="test-sheet"
        side="front"
        imageUrl="/test-sheet/front.jpg"
        writeIns={writeIns}
        layout={layout}
        contestIds={[contest.id]}
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
            type: AdjudicationReason.WriteIn,
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

  const writeIns: Array<
    WriteInAdjudicationReasonInfo | UnmarkedWriteInAdjudicationReasonInfo
  > = [
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
        sheetId="test-sheet"
        side="front"
        imageUrl="/test-sheet/front.jpg"
        writeIns={writeIns}
        layout={layout}
        contestIds={[contest.id]}
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

  const frontWriteIns: Array<
    WriteInAdjudicationReasonInfo | UnmarkedWriteInAdjudicationReasonInfo
  > = [
    {
      type: AdjudicationReason.WriteIn,
      contestId: frontContest1.id,
      optionId: frontContest1WriteInId,
      optionIndex: 0,
    },
    {
      type: AdjudicationReason.WriteIn,
      contestId: frontContest2.id,
      optionId: frontContest2WriteInId,
      optionIndex: 0,
    },
  ];

  const backWriteIns: Array<
    WriteInAdjudicationReasonInfo | UnmarkedWriteInAdjudicationReasonInfo
  > = [
    {
      type: AdjudicationReason.WriteIn,
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
        sheetId="test-sheet"
        side="front"
        imageUrl="/test-sheet/front.jpg"
        writeIns={frontWriteIns}
        layout={frontLayout}
        contestIds={[frontContest1.id, frontContest2.id]}
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
        sheetId="test-sheet"
        side="back"
        imageUrl="/test-sheet/back.jpg"
        writeIns={backWriteIns}
        layout={backLayout}
        contestIds={[backContest.id]}
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
