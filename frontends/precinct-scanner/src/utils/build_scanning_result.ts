import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  BallotSheetInfo,
} from '@votingworks/types';
import {
  RejectedScanningReason,
  ScanningResult,
  ScanningResultType,
} from '../config/types';

function isReasonBlankBallot(reason: AdjudicationReasonInfo): boolean {
  return reason.type === AdjudicationReason.BlankBallot;
}

/**
 * Determines the scanning result of a ballot sheet. Primarily, this function
 * must decide whether a ballot sheet is acceptable or not. If so, it may need
 * review by the voter.
 */
export function buildScanningResult(
  interpreted: BallotSheetInfo
): ScanningResult {
  if (
    interpreted.front.interpretation.type === 'InvalidElectionHashPage' ||
    interpreted.back.interpretation.type === 'InvalidElectionHashPage'
  ) {
    return {
      resultType: ScanningResultType.Rejected,
      rejectionReason: RejectedScanningReason.InvalidElectionHash,
    };
  }

  if (
    interpreted.front.interpretation.type === 'InvalidTestModePage' ||
    interpreted.back.interpretation.type === 'InvalidTestModePage'
  ) {
    return {
      resultType: ScanningResultType.Rejected,
      rejectionReason: RejectedScanningReason.InvalidTestMode,
    };
  }

  if (
    interpreted.front.interpretation.type === 'InvalidPrecinctPage' ||
    interpreted.back.interpretation.type === 'InvalidPrecinctPage'
  ) {
    return {
      resultType: ScanningResultType.Rejected,
      rejectionReason: RejectedScanningReason.InvalidPrecinct,
    };
  }

  if (
    interpreted.front.interpretation.type === 'UnreadablePage' ||
    interpreted.back.interpretation.type === 'UnreadablePage'
  ) {
    return {
      resultType: ScanningResultType.Rejected,
      rejectionReason: RejectedScanningReason.Unreadable,
    };
  }

  if (
    (interpreted.front.interpretation.type === 'InterpretedBmdPage' &&
      interpreted.back.interpretation.type === 'BlankPage') ||
    (interpreted.front.interpretation.type === 'BlankPage' &&
      interpreted.back.interpretation.type === 'InterpretedBmdPage')
  ) {
    return {
      resultType: ScanningResultType.Accepted,
    };
  }

  if (
    interpreted.front.interpretation.type === 'InterpretedHmpbPage' &&
    interpreted.back.interpretation.type === 'InterpretedHmpbPage'
  ) {
    const frontAdjudicationInfo =
      interpreted.front.interpretation.adjudicationInfo;
    const backAdjudicationInfo =
      interpreted.back.interpretation.adjudicationInfo;

    if (
      !frontAdjudicationInfo.requiresAdjudication &&
      !backAdjudicationInfo.requiresAdjudication
    ) {
      return { resultType: ScanningResultType.Accepted };
    }

    // the sheet is blank if BOTH sides are blank
    if (
      frontAdjudicationInfo.enabledReasonInfos.some(isReasonBlankBallot) &&
      backAdjudicationInfo.enabledReasonInfos.some(isReasonBlankBallot)
    ) {
      return {
        resultType: ScanningResultType.NeedsReview,
        adjudicationReasonInfo: [{ type: AdjudicationReason.BlankBallot }],
      };
    }

    return {
      resultType: ScanningResultType.NeedsReview,
      adjudicationReasonInfo: [
        ...frontAdjudicationInfo.enabledReasonInfos.filter(
          (r) => !isReasonBlankBallot(r)
        ),
        ...backAdjudicationInfo.enabledReasonInfos.filter(
          (r) => !isReasonBlankBallot(r)
        ),
      ],
    };
  }

  return {
    resultType: ScanningResultType.Rejected,
    rejectionReason: RejectedScanningReason.Unknown,
  };
}
