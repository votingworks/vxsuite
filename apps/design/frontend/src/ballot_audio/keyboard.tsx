/* istanbul ignore file - demo */

import React from 'react';
import styled from 'styled-components';
import { Button, Caption, DesktopPalette, H4, P } from '@votingworks/ui';
import { IpaPhoneme, phonemes } from '@votingworks/types';
import * as api from '../api';
import { Tooltip, TooltipContainer } from '../tooltip';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const MainKeys = styled.div`
  display: flex;
  gap: 0.25rem;
  justify-content: space-between;
  padding: 0.5rem 0;
`;

const KeySet = styled.div<{ split?: boolean }>`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  justify-content: ${(p) => (p.split ? undefined : 'center')};
  flex-grow: 0;
`;

const Consonants = styled.div`
  flex: 4 0;
`;

const Vowels = styled.div`
  display: flex;
  flex-direction: column;
  align-items: end;
  flex: 3 0;

  ${KeySet} {
    justify-content: end;
  }
`;

const KeyContainer = styled.div`
  position: relative;

  > button {
    background: ${(p) => p.theme.colors.background};
    border-radius: 0.25rem;
    border: 1px solid #aaa;
    box-shadow:
      0.05rem 0.075rem 0.1rem 0 #00000010,
      0.1rem 0.15rem 0.1rem 0.05rem #00000004,
      0.15rem 0.25rem 0.125rem 0.075rem #00000002;
    cursor: pointer;
    font-size: 1.5rem;
    font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
    letter-spacing: -0.075em;
    height: 2.25em;
    width: 2.25em;
    outline-offset: 2px;
    padding: 0.5rem;
    transition: 100ms ease-out;
    transition-property: box-shadow, background-color, border, color,
      outline-offset;

    :hover {
      background-color: ${DesktopPalette.Purple10};
      color: #000;
    }

    :focus:focus-visible {
      background-color: ${DesktopPalette.Purple10};
      color: #000;
    }

    :active,
    &[aria-selected='true'] {
      background-color: ${DesktopPalette.Purple20};
      box-shadow: none;
      color: #000;
      outline-offset: 0;
    }
  }
`;

export interface Phoneme {
  consonant: boolean;
  ipa: IpaPhoneme;
  sampleIpa: string;
  sampleVx: string;
  sampleWord: string;
  shortcut: string | null;
  vx: string;
}

type Alphabet = 'ipa' | 'vx';

const consonantModifier = {
  regular: 'ə',
  ipa: 'ə',
  'x-sampa': '@',
} as const;

export function Keyboard(props: {
  alphabet: Alphabet;
  disabled?: boolean;
  onInput: (phoneme: Phoneme) => void;
  split?: boolean;
}): JSX.Element {
  const { alphabet, disabled, onInput, split } = props;
  const audioTimer = React.useRef<number>();
  const lastAudioPhoneme = React.useRef<Phoneme>();
  const lastAudio = React.useRef<HTMLAudioElement>();

  const [currentSsml, setCurrentSsml] = React.useState<string>('');
  const [playingSample, setPlayingSample] = React.useState(false);

  const audioSample = api.ttsSynthesizeFromSsml.useQuery({
    languageCode: 'en',
    ssml: currentSsml,
  }).data;

  const onMouseOver = React.useCallback(
    (phoneme: Phoneme) => {
      if (audioTimer.current) {
        window.clearTimeout(audioTimer.current);
        audioTimer.current = undefined;
      }

      if (lastAudio.current) {
        if (!lastAudio.current.paused && lastAudioPhoneme.current === phoneme) {
          return;
        }

        lastAudio.current = undefined;
      }

      lastAudioPhoneme.current = phoneme;

      const alphabetForAudio = 'ipa';
      audioTimer.current = window.setTimeout(() => {
        let sound = phoneme[alphabetForAudio];
        if (phoneme.consonant) {
          sound += consonantModifier[alphabetForAudio];
        }

        setCurrentSsml(
          `<speak>` +
            `<phoneme alphabet="${alphabetForAudio}" ph="${sound}">` +
            `${phoneme[alphabet]}` +
            `</phoneme>` +
            `</speak>`
        );
        setPlayingSample(true);
      }, 250);
    },
    [alphabet]
  );

  const onMouseOut = React.useCallback(() => {
    if (audioTimer.current) {
      window.clearTimeout(audioTimer.current);
      audioTimer.current = undefined;
    }

    if (lastAudio.current) {
      // lastAudio.current.pause();
      // lastAudio.current.src = '';
      lastAudio.current = undefined;
    }

    setPlayingSample(false);
    setCurrentSsml('');
  }, []);

  React.useEffect(() => {
    if (!audioSample || !playingSample) return;

    const thisAudio = new Audio(audioSample);
    thisAudio.addEventListener('loadeddata', () => {
      if (thisAudio !== lastAudio.current) {
        thisAudio.pause();
      }
    });
    thisAudio.addEventListener('ended', () => {
      if (thisAudio === lastAudio.current) {
        lastAudio.current = undefined;
        setPlayingSample(false);
      }
    });

    void thisAudio.play();

    lastAudio.current = thisAudio;
  }, [audioSample, playingSample]);

  const consonants = React.useMemo(
    () =>
      split &&
      phonemes.en.consonants.map((phoneme) => (
        <TooltipContainer key={phoneme.ipa}>
          <Tooltip opaque>
            <P weight="bold">Example:</P>
            <P>{phoneme.sampleWord}</P>
            <P>
              <P>{alphabet === 'vx' ? phoneme.sampleVx : phoneme.sampleIpa}</P>
            </P>
          </Tooltip>
          <Key
            alphabet={alphabet}
            disabled={disabled}
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
            onPress={onInput}
            phoneme={phoneme}
          />
        </TooltipContainer>
      )),
    [alphabet, disabled, onMouseOver, onMouseOut, onInput, split]
  );

  const vowels = React.useMemo(
    () =>
      split &&
      phonemes.en.vowels.map((phoneme) => (
        <TooltipContainer key={phoneme.ipa}>
          <Tooltip alignTo="right" opaque>
            <P weight="bold">Example:</P>
            <P>{phoneme.sampleWord}</P>
            <P>{alphabet === 'vx' ? phoneme.sampleVx : phoneme.sampleIpa}</P>
          </Tooltip>
          <Key
            alphabet={alphabet}
            disabled={disabled}
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
            onPress={onInput}
            phoneme={phoneme}
          />
        </TooltipContainer>
      )),
    [alphabet, disabled, onMouseOver, onMouseOut, onInput, split]
  );

  const all = React.useMemo(
    () =>
      !split &&
      Object.values(phonemes.en.allByIpa).map((phoneme, i) => (
        <TooltipContainer key={phoneme.ipa}>
          <Tooltip alignTo={i % 16 < 8 ? 'left' : 'right'} opaque>
            <P weight="bold">Example:</P>
            <P>{phoneme.sampleWord}</P>
            <P>{alphabet === 'vx' ? phoneme.sampleVx : phoneme.sampleIpa}</P>
          </Tooltip>
          <Key
            alphabet={alphabet}
            disabled={disabled}
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
            onPress={onInput}
            phoneme={phoneme}
          />
        </TooltipContainer>
      )),
    [alphabet, disabled, onMouseOver, onMouseOut, onInput, split]
  );

  return (
    <Container>
      <MainKeys>
        {all && <KeySet split={split}>{all}</KeySet>}
        {consonants && (
          <Consonants>
            <H4>Consonants</H4>
            <KeySet split={split}>{consonants}</KeySet>
          </Consonants>
        )}
        {vowels && (
          <Vowels>
            <H4>Vowels</H4>
            <KeySet split={split}>{vowels}</KeySet>
          </Vowels>
        )}
      </MainKeys>
    </Container>
  );
}

const ShortcutLabel = styled(Caption)`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  left: 0.25rem;
  line-height: 1;
  position: absolute;
  top: 0.125rem;
`;

function Key(props: {
  alphabet: Alphabet;
  disabled?: boolean;
  onMouseOver: (p: Phoneme) => void;
  onMouseOut: () => void;
  onPress: (p: Phoneme) => void;
  phoneme: Phoneme;
}) {
  const { alphabet, disabled, onMouseOut, onMouseOver, onPress, phoneme } =
    props;
  return (
    <KeyContainer
      onBlur={onMouseOut}
      onFocus={() => onMouseOver(phoneme)}
      onMouseOut={onMouseOut}
      onMouseOver={() => onMouseOver(phoneme)}
    >
      <Button disabled={disabled} onPress={onPress} value={phoneme}>
        {phoneme[alphabet]}
      </Button>
      {phoneme.shortcut && <ShortcutLabel>{phoneme.shortcut}</ShortcutLabel>}
    </KeyContainer>
  );
}
