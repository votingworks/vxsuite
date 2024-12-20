import { beforeEach, test, expect } from 'vitest';
import { SizeMode } from '@votingworks/types';
import { render } from '../../../test/react_testing_library';
import { Layout, MisvoteWarningsProps } from './types';
import { useLayoutConfig } from './use_layout_config_hook';
import { CONFIG } from './constants';
import { generateContests } from './test_utils.test';

let hookResult: Layout | null = null;

function TestComponent(props: MisvoteWarningsProps) {
  hookResult = useLayoutConfig(props);

  return <div>foo</div>;
}

beforeEach(() => {
  hookResult = null;
});

test('varies according to size mode', () => {
  const props: MisvoteWarningsProps = {
    blankContests: generateContests(2),
    overvoteContests: generateContests(1),
    partiallyVotedContests: generateContests(3),
  };

  render(<TestComponent {...props} />, {
    vxTheme: { sizeMode: 'touchExtraLarge' },
  });
  const layoutXl = hookResult;

  render(<TestComponent {...props} />, {
    vxTheme: { sizeMode: 'touchMedium' },
  });
  const layoutM = hookResult;

  expect(layoutXl).not.toEqual(layoutM);
});

test('sets numCardsPerRow appropriately', () => {
  const sizeMode: SizeMode = 'touchMedium';
  const config = CONFIG[sizeMode];

  const { rerender } = render(
    <TestComponent
      blankContests={generateContests(1)}
      overvoteContests={generateContests(1)}
      partiallyVotedContests={generateContests(1)}
    />,
    { vxTheme: { sizeMode } }
  );
  expect(hookResult).toEqual(
    expect.objectContaining<Partial<Layout>>({
      numCardsPerRow: config.maxCardsPerRow,
    })
  );

  rerender(
    <TestComponent
      blankContests={generateContests(1)}
      overvoteContests={[]}
      partiallyVotedContests={[]}
    />
  );
  expect(hookResult).toEqual(
    expect.objectContaining<Partial<Layout>>({
      numCardsPerRow: 1,
    })
  );
});

test('sets maxColumnsPerCard appropriately', () => {
  const sizeMode: SizeMode = 'touchSmall';
  const config = CONFIG[sizeMode];

  // Should be `1` if there are multiple warning cards:
  const { rerender } = render(
    <TestComponent
      blankContests={generateContests(1)}
      overvoteContests={generateContests(1)}
      partiallyVotedContests={generateContests(1)}
    />,
    { vxTheme: { sizeMode } }
  );
  expect(hookResult).toEqual(
    expect.objectContaining<Partial<Layout>>({
      maxColumnsPerCard: 1,
    })
  );

  // Should be the configured maximum if only one warning card will be rendered:
  rerender(
    <TestComponent
      blankContests={generateContests(1)}
      overvoteContests={[]}
      partiallyVotedContests={[]}
    />
  );
  expect(hookResult).toEqual(
    expect.objectContaining<Partial<Layout>>({
      maxColumnsPerCard: config.maxColumnsPerCard,
    })
  );
});

test('sets showSummaryInPreview appropriately', () => {
  const sizeMode: SizeMode = 'touchMedium';
  const config = CONFIG[sizeMode];

  // Make sure if the config gets changed, we know to update these test
  // assumptions:
  expect(config.maxCardsPerRow).toEqual(2);

  // Should be true when the warning cards wouldn't fit on a single row:
  const { rerender } = render(
    <TestComponent
      blankContests={generateContests(1)}
      overvoteContests={generateContests(1)}
      partiallyVotedContests={generateContests(1)}
    />,
    { vxTheme: { sizeMode } }
  );
  expect(hookResult).toEqual(
    expect.objectContaining<Partial<Layout>>({
      showSummaryInPreview: true,
    })
  );

  // Should be true if any of the cards wouldn't fit vertically:
  rerender(
    <TestComponent
      blankContests={generateContests(config.maxPreviewContestRows + 1)}
      overvoteContests={generateContests(1)}
      partiallyVotedContests={[]}
    />
  );
  expect(hookResult).toEqual(
    expect.objectContaining<Partial<Layout>>({
      showSummaryInPreview: true,
    })
  );

  // Should be false if all contests would fit on-screen, based on config params:
  rerender(
    <TestComponent
      blankContests={generateContests(
        config.maxPreviewContestRows * config.maxColumnsPerCard
      )}
      overvoteContests={[]}
      partiallyVotedContests={[]}
    />
  );
  expect(hookResult).toEqual(
    expect.objectContaining<Partial<Layout>>({
      showSummaryInPreview: false,
    })
  );

  // Same as above with multiple cards containing the max number of contest rows:
  rerender(
    <TestComponent
      blankContests={generateContests(config.maxPreviewContestRows)}
      overvoteContests={[]}
      partiallyVotedContests={generateContests(config.maxPreviewContestRows)}
    />
  );
  expect(hookResult).toEqual(
    expect.objectContaining<Partial<Layout>>({
      showSummaryInPreview: false,
    })
  );
});
