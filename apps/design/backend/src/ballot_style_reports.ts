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

  function document() {
    return BallotStyleReadinessReport(componentProps);
  }

  return renderToPdf({ document, usePrintTheme: true }, renderer.getBrowser());
}
