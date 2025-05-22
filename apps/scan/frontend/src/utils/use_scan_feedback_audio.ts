import React from 'react';

import { PrecinctScannerState } from '@votingworks/types';
import { useHeadphonesPluggedIn } from '@votingworks/ui';

import { useSound } from './use_sound';

export interface UseScanFeedbackAudioInput {
  // eslint-disable-next-line vx/gts-use-optionals
  currentState: PrecinctScannerState | undefined;
  isSoundMuted: boolean;
}

export function useScanFeedbackAudio(input: UseScanFeedbackAudioInput): void {
  const { currentState, isSoundMuted } = input;
  const previousState = React.useRef<PrecinctScannerState | undefined>();

  const headphonesPluggedIn = useHeadphonesPluggedIn();
  const playSuccess = useSound('success');
  const playWarning = useSound('warning');
  const playError = useSound('error');

  if (isSoundMuted || headphonesPluggedIn) return;
  if (previousState.current === currentState) return;

  switch (currentState) {
    case 'accepted': {
      playSuccess();
      break;
    }

    case 'needs_review':
    case 'both_sides_have_paper': {
      playWarning();
      break;
    }

    case 'rejecting':
    case 'jammed':
    case 'double_sheet_jammed':
    case 'unrecoverable_error': {
      playError();
      break;
    }

    default: {
      // No sound
      break;
    }
  }

  previousState.current = currentState;
}
