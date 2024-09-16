import { Buffer } from 'node:buffer';

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

export async function renderBallotStyleReadinessReport(
  params: BallotStyleReadinessReportParams
): Promise<Buffer> {
  const { renderer, componentProps } = params;

  return (
    await renderToPdf(
      {
        document: BallotStyleReadinessReport(componentProps),
        usePrintTheme: true,
      },
      renderer.getBrowser()
    )
  ).unsafeUnwrap();
}
