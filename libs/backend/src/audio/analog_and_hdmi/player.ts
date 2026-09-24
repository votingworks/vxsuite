/* eslint-disable vx/gts-no-return-type-only-generics */
/* eslint-disable vx/gts-jsdoc */
import type { Logger } from '@votingworks/logging';
import { AudioPlayer } from '../player.js';
import { AUDIO_DEVICE_DEFAULT_SINK } from '../../system_call/pulse_audio.js';
import type { AudioCard } from './card.js';
import type { NODE_ENV } from '../../globals.js';

export interface PlayerInterface<Sound extends string> {
  setIsScreenReaderEnabled(enabled: boolean): Promise<void>;
  setVolume(volumePct: number): Promise<void>;
  play(soundName: Sound): Promise<void>;
}

// @coverage-exclude
export function getMockPlayer<Sound extends string>(): PlayerInterface<Sound> {
  return {
    setIsScreenReaderEnabled: () => Promise.resolve(),
    setVolume: () => Promise.resolve(),
    play: () => Promise.resolve(),
  };
}

export interface PlayerInit {
  nodeEnv: NODE_ENV;
  logger: Logger;
  card: AudioCard;
  soundsDirectory: string;
}

/**
 * Audio player that plays sounds through the screen's built-in speaker.
 * Intended for use on v4 VxComputer machines with ELO screens, with headphone
 * audio going through the on-board analog sound card.
 *
 * When the screen reader is enabled, the audio card defaults to headphone
 * output for screen reader audio and temporarily switches to speaker output for
 * sound effects. When the screen reader is disabled, the audio card defaults to
 * speaker output without toggling.
 */
export class Player<Sound extends string> implements PlayerInterface<Sound> {
  private readonly sharedPlayer: AudioPlayer;
  private isScreenReaderEnabled = true;
  private readonly nodeEnv: NODE_ENV;
  private readonly logger: Logger;
  private readonly card: AudioCard;

  constructor(init: PlayerInit) {
    this.card = init.card;
    this.logger = init.logger;
    this.nodeEnv = init.nodeEnv;
    this.sharedPlayer = new AudioPlayer({
      nodeEnv: this.nodeEnv,
      logger: this.logger,
      outputName: AUDIO_DEVICE_DEFAULT_SINK,
      soundsDirectory: init.soundsDirectory,
    });
  }

  async setIsScreenReaderEnabled(enabled: boolean): Promise<void> {
    this.isScreenReaderEnabled = enabled;
    if (enabled) {
      await this.card.useHeadphones();
    } else {
      await this.card.useSpeaker();
    }
  }

  // @coverage-defer
  async setVolume(volumePct: number): Promise<void> {
    await this.card.setVolume(volumePct);
  }

  /**
   * Plays a sound through the built-in speaker
   */
  async play(soundName: Sound): Promise<void> {
    // [TODO] Add locking? We can either ignore/log successive plays while
    // there's already one in progress (or queue them up, but a well-behaved
    // client shouldn't be sending overlapping play requests).

    if (!this.isScreenReaderEnabled) {
      await this.sharedPlayer.play(soundName);
      return;
    }

    try {
      await this.card.useSpeaker();
      await this.sharedPlayer.play(soundName);
    } finally {
      await this.card.useHeadphones();
    }
  }
}

/**
 * Returns a new instance of {@link Player}.
 *
 * Simplifies mocking in consumer tests.
 */
// @coverage-exclude
export function defaultAudioPlayer<Sound extends string>(
  init: PlayerInit
): Player<Sound> {
  return new Player(init);
}
