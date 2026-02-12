/* istanbul ignore file - internal tool - @preserve */

import React from 'react';
import styled from 'styled-components';

import { Button } from '../button';
import { Card } from '../card';
import { Modal, ModalWidth } from '../modal';
import { P, Font } from '../typography';
import { getAudioGainRatio, AudioVolume } from './audio_volume';

export interface HeadphoneCalibrationButtonProps {
  audioUrl: string;
  onBegin: () => void;
  onEnd: () => void;
}

/**
 * Headphone calibration utility for use in the hardware testing apps.
 *
 * Enables adjustments to the base volume offset applied to screen reader audio,
 * to determine a suitable default, for a given set of headphones, that keeps
 * volume adjustments within VVSG2 ranges.
 */
export function HeadphoneCalibrationButton(
  props: HeadphoneCalibrationButtonProps
): JSX.Element {
  const { audioUrl, onEnd, onBegin } = props;
  const [open, setOpen] = React.useState(false);

  function begin() {
    onBegin();
    setOpen(true);
  }

  function end() {
    onEnd();
    setOpen(false);
  }

  return (
    <div>
      <Button onPress={begin}>Calibrate Headphones</Button>
      {open && <CalibrationModal audioUrl={audioUrl} close={end} />}
    </div>
  );
}

let webAudioCtx: AudioContext | undefined;
function getWebAudioCtxInstance() {
  if (!webAudioCtx) webAudioCtx = new AudioContext();
  return webAudioCtx;
}

let gainNode: GainNode | undefined;
function getGainNodeInstance() {
  const ctx = getWebAudioCtxInstance();

  if (!gainNode) {
    gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);
  }

  return gainNode;
}

const Content = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 1rem;
`;

const GainControl = styled.input.attrs({ type: 'range' })`
  appearance: none;
  background: ${(p) => p.theme.colors.background};
  border-color: ${(p) => p.theme.colors.primary};
  cursor: pointer;
  flex-grow: 1;
  height: 3rem;
  padding: 1.75rem 0.75rem;
  width: 100%;

  ::-webkit-slider-runnable-track {
    background: ${(p) => p.theme.colors.primaryContainer};
    border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  }

  ::-webkit-slider-thumb {
    appearance: none;
    background: ${(p) => p.theme.colors.primary};
    border-radius: ${(p) => p.theme.sizes.borderRadiusRem / 2}rem;
    cursor: grab;
    height: 2rem;
    outline: 0.25rem solid ${(p) => p.theme.colors.primary};
    transition: all 100ms ease-out;
    width: 2rem;

    :active {
      cursor: grabbing;
    }

    :active,
    :hover {
      outline: 0.5rem solid ${(p) => p.theme.colors.primary};
      outline-offset: -1px;
    }
  }
`;

function CalibrationModal(props: { audioUrl: string; close: () => void }) {
  const { audioUrl, close } = props;

  const [playing, setPlaying] = React.useState(false);
  const [offset, setOffset] = React.useState(-90);

  const gainNodeRef = React.useRef(getGainNodeInstance());
  const webAudioCtxRef = React.useRef(getWebAudioCtxInstance());

  const player = React.useMemo(() => {
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.volume = 1; // Volume controlled via audio context gain node.

    const srcNode = webAudioCtxRef.current.createMediaElementSource(audio);
    srcNode.connect(gainNodeRef.current);

    return audio;
  }, [audioUrl]);

  const pendingPlayRef = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    if (!playing) return;
    pendingPlayRef.current = player.play();

    return () => {
      // Attempting to pause before a pending play command has resolved would
      // result in an exception.
      void pendingPlayRef.current.then(() => player.pause());
    };
  }, [playing, player]);

  // It's easier to calibrate to the maximum allowed volume and work our way
  // backwards from there when setting our default offset and volume adjustment
  // increments:
  gainNodeRef.current.gain.value = getAudioGainRatio(AudioVolume.MAXIMUM, {
    minGainDb: offset,
  });

  function onGainChange(event: React.ChangeEvent<HTMLInputElement>) {
    setOffset(event.target.valueAsNumber);
  }

  return (
    <Modal
      actions={
        <Button icon="Done" onPress={close} fill="outlined" color="primary">
          Done
        </Button>
      }
      content={
        <Content>
          <div>
            <P>
              1. When ready, press &quot;Play&quot; to start the sample screen
              reader audio.
            </P>
            <P>
              2. Adjust the minimum gain offset until the SPL meter reads{' '}
              <Font noWrap weight="bold">
                100 dB
              </Font>
              , without going over.
            </P>
            <P>
              3. Note down the corresponding gain offset below, which will be
              used to update the product code.
            </P>
          </div>
          <Card>
            <P weight="bold">Minimum Gain Offset:</P>
            <div
              style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}
            >
              <GainControl
                max={-35}
                min={-90}
                onChange={onGainChange}
                step={0.1}
                value={offset}
              />
              <Font
                noWrap
                style={{ fontSize: '1.5rem', minWidth: '8ch' }}
                weight="bold"
              >
                {offset.toFixed(2)} dB
              </Font>
            </div>
          </Card>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              disabled={!playing}
              icon="Pause"
              onPress={setPlaying}
              value={false}
            >
              {playing ? 'Pause' : 'Paused'}
            </Button>
            <Button
              disabled={playing}
              icon={playing ? 'Loading' : 'Play'}
              onPress={setPlaying}
              value
              variant={playing ? 'neutral' : 'primary'}
            >
              {playing ? 'Playing...' : 'Play'}
            </Button>
          </div>
        </Content>
      }
      modalWidth={ModalWidth.Wide}
      onOverlayClick={close}
      title="Headphone Calibration"
    />
  );
}
