import { expect, test, vi } from 'vitest';
import { withApp } from '../test/helpers/pdi_helpers';

vi.mock('./audio/player');

test('playAudio() uses configured audio player', () =>
  withApp(async ({ apiClient, mockAudioPlayer }) => {
    mockAudioPlayer.play.mockResolvedValueOnce();

    await apiClient.playSound({ name: 'warning' });
    expect(mockAudioPlayer.play).toHaveBeenCalledWith('warning');
  }));
