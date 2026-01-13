import React from 'react';

import { PrecinctScannerState } from '@votingworks/types';

import { SoundName } from '@votingworks/scan-backend';

export interface UseScanFeedbackAudioInput {
  // eslint-disable-next-line vx/gts-use-optionals
  currentState: PrecinctScannerState | undefined;
  isSoundMuted: boolean;
  playSound: (params: { name: SoundName }) => void;
}

export function useScanFeedbackAudio(input: UseScanFeedbackAudioInput): void {
  const { currentState, isSoundMuted, playSound } = input;
  const previousState = React.useRef<PrecinctScannerState | undefined>();

  if (isSoundMuted) return;
  if (previousState.current === currentState) return;

  switch (currentState) {
    case 'accepted': {
      playSound({ name: 'success' });
      break;
    }

    case 'needs_review':
    case 'both_sides_have_paper': {
      playSound({ name: 'warning' });
      break;
    }

    case 'rejecting':
    case 'jammed':
    case 'unrecoverable_error': {
      playSound({ name: 'error' });
      break;
    }

    default: {
      // No sound
      break;
    }
  }

  previousState.current = currentState;
}
