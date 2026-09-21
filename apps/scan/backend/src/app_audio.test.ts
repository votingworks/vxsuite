import { expect, test, vi } from 'vitest';
import { withApp } from '../test/helpers/scanner_helpers.js';

test('playAudio() uses configured audio player', () =>
  withApp(async ({ apiClient, mockAudioPlayer }) => {
    const mockPlay = vi.spyOn(mockAudioPlayer, 'play');

    await apiClient.playSound({ name: 'warning' });
    expect(mockPlay).toHaveBeenCalledWith('warning');
  }));
