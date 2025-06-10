import { expect, test, vi } from 'vitest';
import {
  PRECINCT_SCANNER_STATES,
  PrecinctScannerState,
} from '@votingworks/types';
import { SoundName } from '@votingworks/scan-backend';
import { renderHook } from '../../test/react_testing_library';
import { useScanFeedbackAudio } from './use_scan_feedback_audio';

const playSound = vi.fn<(params: { name: SoundName }) => void>();

const STATE_SOUND_MAPPING: Array<{
  state: PrecinctScannerState;
  sound: SoundName;
}> = [
  { state: 'accepted', sound: 'success' },
  { state: 'needs_review', sound: 'warning' },
  { state: 'both_sides_have_paper', sound: 'warning' },
  { state: 'rejecting', sound: 'error' },
  { state: 'jammed', sound: 'error' },
  { state: 'double_sheet_jammed', sound: 'error' },
  { state: 'unrecoverable_error', sound: 'error' },
];

test.each(STATE_SOUND_MAPPING)(
  '$state state change plays $expected sound',
  ({ sound, state }) => {
    const result = renderHook(useScanFeedbackAudio, {
      initialProps: {
        currentState: 'no_paper',
        isSoundMuted: false,
        playSound,
      },
    });
    expect(playSound).not.toHaveBeenCalled();

    playSound.mockResolvedValueOnce(undefined);

    result.rerender({ currentState: state, isSoundMuted: false, playSound });
    expect(playSound).toHaveBeenCalledWith({ name: sound });

    playSound.mockClear();

    // No sound if state is unchanged:
    result.rerender({ currentState: state, isSoundMuted: false, playSound });
    expect(playSound).not.toHaveBeenCalled();
  }
);

const STATES_WITH_SOUND = STATE_SOUND_MAPPING.map((m) => m.state);

test.each(STATES_WITH_SOUND)("no '%s' sound when system is muted", (state) => {
  const result = renderHook(useScanFeedbackAudio, {
    initialProps: { currentState: 'no_paper', isSoundMuted: false, playSound },
  });

  result.rerender({ currentState: state, isSoundMuted: true, playSound });
  expect(playSound).not.toHaveBeenCalled();
});

test('no sound for all other states', () => {
  const result = renderHook(useScanFeedbackAudio, {
    initialProps: { currentState: 'no_paper', isSoundMuted: false, playSound },
  });

  for (const state of PRECINCT_SCANNER_STATES) {
    if (STATES_WITH_SOUND.includes(state)) continue;

    result.rerender({ currentState: state, isSoundMuted: false, playSound });
  }

  expect(playSound).not.toHaveBeenCalled();
});
