/* istanbul ignore file - demo */

import React from 'react';
import styled from 'styled-components';
import { Button, Caption, DesktopPalette, H4, P } from '@votingworks/ui';
import {
  isVowel,
  LanguageCode,
  phonemes,
  TtsPhoneme,
} from '@votingworks/types';
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

export type Phoneme = TtsPhoneme;

type Alphabet = 'ipa' | 'vx';

const DEFAULT_CONSONANT_MODIFIER = 'ə';

const CONSONANT_MODIFIER: Partial<Record<LanguageCode, string>> = {
  [LanguageCode.ENGLISH]: DEFAULT_CONSONANT_MODIFIER,
  [LanguageCode.KOREAN]: 'ɯ',
};

export function Keyboard(props: {
  alphabet: Alphabet;
  disabled?: boolean;
  languageCode: LanguageCode;
  onInput: (phoneme: Phoneme) => void;
  split?: boolean;
}): JSX.Element {
  const { alphabet, disabled, languageCode, onInput, split } = props;
  const audioTimer = React.useRef<number>();
  const lastAudioPhoneme = React.useRef<Phoneme>();
  const lastAudio = React.useRef<HTMLAudioElement>();

  const [currentSsml, setCurrentSsml] = React.useState<string>('');
  const [playingSample, setPlayingSample] = React.useState(false);

  const audioSample = api.ttsSynthesizeFromSsml.useQuery({
    languageCode,
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
        if (!isVowel(phoneme.ipa)) {
          sound +=
            CONSONANT_MODIFIER[languageCode] || DEFAULT_CONSONANT_MODIFIER;
        }

        setCurrentSsml(
          `<speak>` +
            `<phoneme alphabet="${alphabetForAudio}" ph="${sound}">` +
            `${phoneme[alphabetForAudio]}` +
            `</phoneme>` +
            `</speak>`
        );
        setPlayingSample(true);
      }, 250);
    },
    [languageCode]
  );

  const onMouseOut = React.useCallback(() => {
    if (audioTimer.current) {
      window.clearTimeout(audioTimer.current);
      audioTimer.current = undefined;
    }

    if (lastAudio.current) {
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
      phonemes[languageCode].consonants.map((phoneme) => (
        <TooltipContainer key={phoneme.ipa}>
          <Tooltip opaque>
            <P weight="bold">Example:</P>
            <P>{phoneme.sampleWord}</P>
            <P>{alphabet === 'vx' ? phoneme.sampleIpa : phoneme.sampleIpa}</P>
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
    [split, languageCode, alphabet, disabled, onMouseOver, onMouseOut, onInput]
  );

  const vowels = React.useMemo(
    () =>
      split &&
      phonemes[languageCode].vowels.map((phoneme) => (
        <TooltipContainer key={phoneme.ipa}>
          <Tooltip alignTo="right" opaque>
            <P weight="bold">Example:</P>
            <P>{phoneme.sampleWord}</P>
            <P>{alphabet === 'vx' ? phoneme.sampleIpa : phoneme.sampleIpa}</P>
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
    [split, languageCode, alphabet, disabled, onMouseOver, onMouseOut, onInput]
  );

  const all = React.useMemo(
    () =>
      !split &&
      Object.values(phonemes[languageCode].allByIpa).map((phoneme, i) => (
        <TooltipContainer key={phoneme.ipa}>
          <Tooltip alignTo={i % 16 < 8 ? 'left' : 'right'} opaque>
            <P weight="bold">Example:</P>
            <P>{phoneme.sampleWord}</P>
            <P>{alphabet === 'vx' ? phoneme.sampleIpa : phoneme.sampleIpa}</P>
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
    [split, languageCode, alphabet, disabled, onMouseOver, onMouseOut, onInput]
  );

  return (
    <Container>
      <MainKeys>
        {all && <KeySet split={split}>{all}</KeySet>}
        {consonants && (
          <Consonants style={{ flex: `${consonants.length - 1} 0` }}>
            <H4
              style={{
                color: DesktopPalette.Gray80,
                fontWeight: 900,
              }}
            >
              Consonants
            </H4>
            <KeySet split={split}>{consonants}</KeySet>
          </Consonants>
        )}
        {vowels && (
          <Vowels style={{ flex: `${vowels.length + 1} 0` }}>
            <H4
              style={{
                color: DesktopPalette.Gray80,
                fontWeight: 900,
              }}
            >
              Vowels
            </H4>
            <KeySet split={split}>{vowels}</KeySet>
          </Vowels>
        )}
      </MainKeys>
    </Container>
  );
}

const ShortcutLabel = styled(Caption)`
  color: ${DesktopPalette.Gray60};
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
      {phoneme.shortcut && false && (
        <ShortcutLabel>{phoneme.shortcut}</ShortcutLabel>
      )}
    </KeyContainer>
  );
}
