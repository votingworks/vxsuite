import React from 'react';
import styled from 'styled-components';
import {
  DesktopPalette,
  H4,
  HoverButton,
  HoverButtonProps,
  P,
} from '@votingworks/ui';
import { phonemes } from './phonemes';
import { Tooltip, TooltipContainer } from './tooltip';
import * as api from '../api';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const MainKeys = styled.div`
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem 0;
`;

const KeySet = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const Consonants = styled.div`
  flex: 4 0;
`;

const Vowels = styled.div`
  flex: 3 0;
`;

const Key = styled(HoverButton)`
  background: ${(p) => p.theme.colors.background};
  border-radius: 0.25rem;
  border: 1px solid #aaa;
  box-shadow:
    0.05rem 0.075rem 0.1rem 0 #00000010,
    0.1rem 0.15rem 0.1rem 0.05rem #00000004,
    0.15rem 0.25rem 0.125rem 0.075rem #00000002;
  cursor: pointer;
  font-size: 1.5rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  min-height: 2.25em;
  min-width: 2.25em;
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
` as unknown as new <T>() => React.Component<HoverButtonProps<T>>;

export interface Phoneme {
  ipa: string;
  'x-sampa': string;
  exampleWord: string;
  exampleIpa: string;
  exampleXsampa: string;
  isConsonant: boolean;
}

const consonantModfier = {
  ipa: 'ə',
  'x-sampa': '@',
} as const;

export function Keyboard(props: {
  alphabet: 'ipa' | 'x-sampa';
  onInput: (phoneme: Phoneme) => void;
}): JSX.Element {
  const { alphabet, onInput } = props;
  const audioTimer = React.useRef<number>();
  const lastAudioPhoneme = React.useRef<Phoneme>();
  const lastAudio = React.useRef<HTMLAudioElement>();

  const [currentSsml, setCurrentSsml] = React.useState<string>('');
  const [playingSample, setPlayingSample] = React.useState(false);

  const audioSample = api.synthesizedSsml.useQuery({
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

        lastAudio.current.pause();
        lastAudio.current = undefined;
      }

      lastAudioPhoneme.current = phoneme;

      audioTimer.current = window.setTimeout(() => {
        let sound = phoneme[alphabet];
        if (phoneme.isConsonant) {
          sound += consonantModfier[alphabet];
        }

        setCurrentSsml(
          `<speak>` +
            `<phoneme alphabet="${alphabet}" ph="${sound}">` +
            `${phoneme[alphabet]}` +
            `</phoneme>` +
            `</speak>`
        );
        setPlayingSample(true);
      }, 500);
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
      lastAudio.current.src = '';
      lastAudio.current = undefined;
    }

    setPlayingSample(false);
    setCurrentSsml('');
  }, []);

  React.useEffect(() => {
    if (!audioSample || !playingSample) return;

    lastAudio.current = new Audio(`data:audio/mp3;base64,${audioSample}`);
    lastAudio.current.addEventListener('ended', () => {
      lastAudio.current = undefined;
      setPlayingSample(false);
    });

    void lastAudio.current.play();
  }, [audioSample, playingSample]);

  const consonants = React.useMemo(
    () =>
      phonemes.en.consonants.map((phoneme) => (
        <TooltipContainer key={phoneme.ipa}>
          <Tooltip opaque>
            <P weight="bold">Example:</P>
            <P>{phoneme.exampleWord}</P>
            <P>
              {alphabet === 'ipa' ? phoneme.exampleIpa : phoneme.exampleXsampa}
            </P>
          </Tooltip>
          <Key
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
            onPress={onInput}
            value={phoneme}
          >
            {phoneme[alphabet]}
          </Key>
        </TooltipContainer>
      )),
    [alphabet, onMouseOver, onMouseOut, onInput]
  );

  const vowels = React.useMemo(
    () =>
      phonemes.en.vowels.map((phoneme) => (
        <TooltipContainer key={phoneme.ipa}>
          <Tooltip alignTo="right" opaque>
            <P weight="bold">Example:</P>
            <P>{phoneme.exampleWord}</P>
            <P>
              {alphabet === 'ipa' ? phoneme.exampleIpa : phoneme.exampleXsampa}
            </P>
          </Tooltip>
          <Key
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
            onPress={onInput}
            value={phoneme}
          >
            {phoneme[alphabet]}
          </Key>
        </TooltipContainer>
      )),
    [alphabet, onMouseOver, onMouseOut, onInput]
  );

  return (
    <Container>
      <MainKeys>
        <Consonants>
          <H4>Consonants</H4>
          <KeySet>{consonants}</KeySet>
        </Consonants>
        <Vowels>
          <H4>Vowels</H4>
          <KeySet>{vowels}</KeySet>
        </Vowels>
      </MainKeys>
    </Container>
  );
}
