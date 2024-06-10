import { Buffer } from 'buffer';

import {
  BallotStyleReadinessReport,
  BallotStyleReadinessReportProps,
} from '@votingworks/ui';
import { renderToPdf } from '@votingworks/printing';
import { PlaywrightRenderer } from '@votingworks/hmpb';

export interface BallotStyleReadinessReportParams {
  componentProps: BallotStyleReadinessReportProps;
  renderer: PlaywrightRenderer;
}

export function renderBallotStyleReadinessReport(
  params: BallotStyleReadinessReportParams
): Promise<Buffer> {
  const { renderer, componentProps } = params;

  return renderToPdf(
    {
      document: BallotStyleReadinessReport(componentProps),
      usePrintTheme: true,
    },
    renderer.getBrowser()
  );
}
