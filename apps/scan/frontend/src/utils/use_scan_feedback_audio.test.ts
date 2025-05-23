import { beforeEach, expect, Mock, test, vi } from 'vitest';
import {
  PRECINCT_SCANNER_STATES,
  PrecinctScannerState,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { useHeadphonesPluggedIn } from '@votingworks/ui';
import { SoundType, useSound } from './use_sound';
import { renderHook } from '../../test/react_testing_library';
import { useScanFeedbackAudio } from './use_scan_feedback_audio';

vi.mock('../utils/use_sound');
vi.mock('@votingworks/ui');

const useSoundMock = vi.mocked(useSound);
const mockSounds: Partial<Record<SoundType, Mock<() => void>>> = {
  error: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
};

const useHeadphonesPluggedInMock = vi.mocked(useHeadphonesPluggedIn);

function throwOnAllMockSounds() {
  for (const [type, mockSound] of Object.entries(mockSounds)) {
    mockSound.mockImplementation(() => {
      throw new Error(`Unexpected sound played: ${type}`);
    });
  }
}

beforeEach(() => {
  throwOnAllMockSounds();
  useSoundMock.mockImplementation((type) => assertDefined(mockSounds[type]));
});

const STATE_SOUND_MAPPING: Array<{
  state: PrecinctScannerState;
  sound: SoundType;
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
    useHeadphonesPluggedInMock.mockReturnValue(false);
    throwOnAllMockSounds();

    const result = renderHook(useScanFeedbackAudio, {
      initialProps: { currentState: 'no_paper', isSoundMuted: false },
    });

    const expectedSoundMock = assertDefined(mockSounds[sound]);
    expectedSoundMock.mockImplementation(() => {});

    result.rerender({ currentState: state, isSoundMuted: false });
    expect(expectedSoundMock).toHaveBeenCalledOnce();

    expectedSoundMock.mockClear();

    // No sound if state is unchanged:
    result.rerender({ currentState: state, isSoundMuted: false });
    expect(expectedSoundMock).not.toHaveBeenCalled();
  }
);

const STATES_WITH_SOUND = STATE_SOUND_MAPPING.map((m) => m.state);

test.each(STATES_WITH_SOUND)("no '%s' sound over headphones", (state) => {
  useHeadphonesPluggedInMock.mockReturnValue(true);
  throwOnAllMockSounds();

  const result = renderHook(useScanFeedbackAudio, {
    initialProps: { currentState: 'no_paper', isSoundMuted: false },
  });

  result.rerender({ currentState: state, isSoundMuted: false });
});

test.each(STATES_WITH_SOUND)("no '%s' sound when system is muted", (state) => {
  useHeadphonesPluggedInMock.mockReturnValue(false);
  throwOnAllMockSounds();

  const result = renderHook(useScanFeedbackAudio, {
    initialProps: { currentState: 'no_paper', isSoundMuted: false },
  });

  result.rerender({ currentState: state, isSoundMuted: true });
});

test('no sound for all other states', () => {
  useHeadphonesPluggedInMock.mockReturnValue(false);
  throwOnAllMockSounds();

  const result = renderHook(useScanFeedbackAudio, {
    initialProps: { currentState: 'no_paper', isSoundMuted: false },
  });

  for (const state of PRECINCT_SCANNER_STATES) {
    if (STATES_WITH_SOUND.includes(state)) continue;

    result.rerender({ currentState: state, isSoundMuted: false });
  }
});
