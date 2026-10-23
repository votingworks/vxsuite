import React from 'react';

import type { PrecinctScannerState } from '@votingworks/types';

import type { SoundName } from '@votingworks/scan-backend';

export interface UseScanFeedbackAudioInput {
  // eslint-disable-next-line vx/gts-use-optionals
  currentState: PrecinctScannerState | undefined;
  isSoundMuted: boolean;
  playSound: (params: { name: SoundName }) => void;
}

export function useScanFeedbackAudio(input: UseScanFeedbackAudioInput): void {
  const { currentState, isSoundMuted, playSound } = input;
  const previousState = React.useRef<PrecinctScannerState | undefined>();

  React.useEffect(() => {
    if (isSoundMuted || previousState.current === currentState) return;
    previousState.current = currentState;

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
  }, [currentState, isSoundMuted, playSound]);
}
