import { describe, expect, test, vi } from 'vitest';

import type {
  ElectionDefinition,
  OptionalCandidateOrderings,
} from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library.js';
import { ReviewPage } from './review_page.js';
import { Review } from '../components/review.js';

vi.mock(import('../components/review.js'), async (importActual) => {
  const actual = await importActual();
  return { ...actual, Review: vi.fn(actual.Review) };
});

describe('propagates candidate orderings', () => {
  test('explicit', () => {
    testOrderings({ contest1: [{ id: 'candidate2' }, { id: 'candidate1' }] });
  });

  test('null', () => {
    testOrderings(null);
  });

  function testOrderings(orderings: OptionalCandidateOrderings) {
    vi.mocked(Review).mockImplementation((props) => {
      expect(props.candidateOrderings).toEqual(orderings);
      return <div data-testid="MockReview" />;
    });

    render(
      <ReviewPage
        candidateOrderings={orderings}
        contests={[]}
        electionDefinition={
          { not: 'relevant' } as unknown as ElectionDefinition
        }
        precinctId="irrelevant"
        printScreenUrl="irrelevant"
        votes={{}}
      />
    );

    screen.getByTestId('MockReview');
  }
});
