import { expect, test, vi } from 'vitest';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import * as ui from '@votingworks/ui';
import { render, screen } from '../../../test/react_testing_library.js';
import { CvrSummaries } from './cvr_summaries.js';

const progressBarSpy = vi.spyOn(ui, 'ProgressBar');

test('renders provided metrics', () => {
  render(
    <CvrSummaries
      cvrs={2048}
      locations={{ loaded: 12, total: 60 }}
      scanners={128}
    />
  );

  screen.getByText(hasTextAcrossElements(['Locations', '12 / 60'].join('')));
  screen.getByText(hasTextAcrossElements(['Scanners', '128'].join('')));
  screen.getByText(hasTextAcrossElements(['CVRs', '2,048'].join('')));

  screen.getByRole('progressbar');
  const progressBarProps = progressBarSpy.mock.calls[0][0];
  expect(progressBarProps.progress).toEqual(0.2);
});
