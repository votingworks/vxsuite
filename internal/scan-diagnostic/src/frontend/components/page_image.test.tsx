import React from 'react';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { find } from '@votingworks/utils';
import { render, screen } from '@testing-library/react';
import { CandidateContest } from '@votingworks/types';
import { PageImage } from './page_image';

test('renders', async () => {
  const { election } = electionGridLayoutNewHampshireAmherstFixtures;
  const contest = find(
    election.contests,
    (c): c is CandidateContest => c.type === 'candidate'
  );
  const candidate = contest.candidates[0];

  render(
    <PageImage
      side="front"
      sheetId="abc123"
      markThresholds={{ marginal: 0.05, definite: 0.08 }}
      marks={[
        {
          type: 'candidate',
          contestId: contest.id,
          optionId: candidate.id,
          score: 0.1,
          bounds: { x: 0, y: 0, width: 1, height: 1 },
          scoredOffset: { x: 0, y: 0 },
          target: {
            bounds: { x: 0, y: 0, width: 1, height: 1 },
            inner: { x: 0, y: 0, width: 1, height: 1 },
          },
        },
      ]}
    />
  );

  await screen.findByAltText('Scanned front of ballot');
});
