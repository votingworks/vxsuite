import {
  Button,
  ButtonProps,
  DesktopPalette,
  Font,
  Icons,
  Modal,
  ModalWidth,
  P,
} from '@votingworks/ui';
import React from 'react';
import styled, { css, keyframes } from 'styled-components';
import { assertDefined } from '@votingworks/basics';
import { Keyboard, Phoneme } from './keyboard';
import { Tooltip, tooltipContainerCss } from './tooltip';
import { phonemes } from './phonemes';
import * as api from '../api';

const Container = styled.div`
  background: ${(p) => p.theme.colors.containerLow};
  border: 2px solid ${(p) => p.theme.colors.containerLow};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  height: max-content + 0.5rem;
  margin: 0 0 0.5rem;
  padding: 1rem;
  min-height: max-content;
  max-height: 0.5vh;
  overflow-y: auto;
  resize: none;
  transition: 120ms ease-out;
  transition-property: background, border, color;

  :focus-within,
  :hover {
    border-color: ${DesktopPalette.Purple60};
    outline: none;
  }
`;

const Words = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const Word = styled.button`
  background: ${(p) => p.theme.colors.background};
  border-radius: 0.25rem;
  border: 1px solid #999;
  color: #666;
  cursor: pointer;
  outline-offset: 2px;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.5rem;
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  :focus,
  :hover {
    background-color: ${DesktopPalette.Purple10};
    color: #000;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20};
    color: #000;
    outline-offset: 0;
  }
`;

const ModalContent = styled.div`
  padding-bottom: 1rem;

  * {
    :focus {
      outline: 0.125rem dashed ${DesktopPalette.Purple70};

      :not(:focus-visible) {
        outline: none;
      }
    }
  }
`;

const Preview = styled.div`
  display: flex;
  border: 1px solid #aaa;
  background-color: #eee;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  flex-grow: 1;
  font-size: 3rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};

  /* gap: 0.5rem; */
  min-width: max-content;
  padding: 1.25rem 1.5rem;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
`;

const Backspace = styled(Button)`
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  display: flex;
  font-size: 1.5rem;
  padding: 1.5rem 2rem;
`;

const PreviewContainer = styled.div`
  display: flex;
  margin: 0.5rem 0 0.75rem;
  min-height: 6.75rem;
`;

const SyllableText = styled.span`
  display: inline;
`;

const cursorAnimation = keyframes`
  from { border-right: 0.25rem solid currentColor; }
  to { border-right: 0.25rem solid transparent; }
`;

const SyllableDelete = styled(Button)`
  ${tooltipContainerCss}

  border-radius: 100vh;
  border: none;
  color: ${DesktopPalette.Purple70};
  cursor: pointer;
  display: none;
  font-size: 1.5rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  outline-offset: 2px;
  padding: 0.25rem 0.5rem;
  position: absolute;
  right: 0;
  top: 0;
  transform: translate(50%, -50%);
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  :focus,
  :hover {
    color: ${DesktopPalette.Purple70};
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20};
    color: #000;
    outline-offset: 0;
  }
` as unknown as new <T>() => React.Component<ButtonProps<T>>;

const ToggleStress = styled(Button)`
  ${tooltipContainerCss}

  border-radius: 100vh;
  border: none;
  color: ${DesktopPalette.Purple70};
  cursor: pointer;
  display: none;
  font-size: 1.5rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  left: 0;
  outline-offset: 2px;
  padding: 0.25rem 0.5rem;
  position: absolute;
  top: 0;
  transform: translate(-50%, -50%);
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  :focus,
  :hover {
    color: ${DesktopPalette.Purple70};
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20};
    color: #000;
    outline-offset: 0;
  }
` as unknown as new <T>() => React.Component<ButtonProps<T>>;

const SwitchAlphabet = styled(Button)`
  border: none;
  border-radius: 0;
  border-bottom: 0.125rem solid ${DesktopPalette.Purple70};
  font-size: 0.75rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  outline-offset: 2px;
  padding: 0.125rem 0.25rem;
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  :focus,
  :hover {
    color: ${DesktopPalette.Purple70};
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20};
    color: #000;
    outline-offset: 0;
  }
` as unknown as new <T>() => React.Component<ButtonProps<T>>;

const styleCurrentSyllable = css`
  border-bottom: 0.25rem dashed ${DesktopPalette.Purple70};
  min-width: 3rem;

  ${SyllableText} {
    animation: ${cursorAnimation} 1s steps(2, start) infinite;
  }
`;

const KeyboardContainer = styled.div`
  display: flex;
  justify-content: center;
`;

const Syllable = styled.div<{
  current?: boolean;
  emphasize?: boolean;
}>`
  border-bottom: 0.25rem dashed #ccc;
  cursor: pointer;
  display: flex;
  font-weight: ${(p) => (p.emphasize ? 900 : p.theme.sizes.fontWeight.bold)};
  padding: 0.25rem;
  position: relative;
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  &:hover {
    background-color: ${(p) => p.theme.colors.background};

    button {
      display: block;
    }
  }

  ${(p) => p.current && styleCurrentSyllable}
`;

const Boundary = styled.div`
  border-bottom: 0.25rem dotted transparent;
  padding: 0.25rem;
`;

const AddSyllable = styled(Button)`
  background: none;
  border-radius: 100vh;
  border: none;
  color: ${DesktopPalette.Purple40};
  cursor: pointer;
  font-size: 2rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  margin: 0 0.5rem;
  min-height: 2em;
  min-width: 2em;
  outline-offset: 2px;
  padding: 0.5rem;
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  :focus,
  :hover {
    background-color: ${DesktopPalette.Purple10};
    color: ${DesktopPalette.Purple70};
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20};
    color: ${DesktopPalette.Purple80};
    outline-offset: 0;
  }

  ${tooltipContainerCss}
`;

const PlayPreview = styled(Button)`
  background: none;
  color: ${DesktopPalette.Purple80};
  cursor: pointer;
  font-size: 1.25rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  min-height: 2em;
  min-width: 2em;
  outline-offset: 2px;
  padding: 0.75rem 1rem;
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  :hover,
  :focus:focus-visible {
    background-color: ${DesktopPalette.Purple10} !important;
    color: ${DesktopPalette.Purple80};
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20} !important;
    color: ${DesktopPalette.Purple80};
    outline-offset: 0;
  }

  ${tooltipContainerCss}
`;

const DevMenu = styled.div`
  background-color: #fff;
  display: flex;
  gap: 1rem;
  left: 0;
  opacity: 0.5;
  padding: 1rem;
  position: fixed;
  top: 0;
  width: 100%;
  transition: 120ms ease-out;
  transition-property: opacity;

  :hover {
    opacity: 1;
  }
`;

const Spacer = styled.span`
  flex-grow: 1;
`;

interface SyllableInput {
  phonemes: Phoneme[];
  stress?: 'primary' | 'secondary' | 'none';
}

const emptySyllable: Readonly<SyllableInput> = {
  phonemes: [],
  stress: 'none',
};

const alphabets = ['ipa', 'x-sampa', 'regular'] as const;

export function Phoneditor(props: {
  disabled?: boolean;
  text: string;
}): JSX.Element {
  const { disabled, text } = props;

  const [words, wordElements] = React.useMemo(() => {
    const fragments = text.split(' ');

    const elems: JSX.Element[] = [];
    for (let i = 0; i < fragments.length; i += 1) {
      elems.push(
        <Word data-word={fragments[i]} key={fragments[i]} onClick={undefined}>
          {fragments[i]}
        </Word>
      );
    }

    return [fragments, elems];
  }, [text]);

  const [splitKeyboard, setSplitKeyboard] = React.useState(true);
  const [alphabet, setAlphabet] = React.useState<'ipa' | 'x-sampa' | 'regular'>(
    'regular'
  );
  const [currentWord, setCurrentWord] = React.useState<string>();
  const [syllables, setSyllables] = React.useState<SyllableInput[]>([
    { ...emptySyllable },
  ]);
  const [currentSyllableIdx, setCurrentSyllableIdx] = React.useState(
    syllables.length - 1
  );
  const [playingPreview, setPlayingPreview] = React.useState(false);
  const [ssmlToPreview, setSsmlToPreview] = React.useState('');
  const lastAudio = React.useRef<HTMLAudioElement>();

  const audioPreviewQuery = api.synthesizedSsml.useQuery({
    languageCode: 'en',
    ssml: ssmlToPreview,
  });
  const audioPreview = audioPreviewQuery.data;
  const audioPreviewLoading = audioPreviewQuery.isLoading;

  const onClickWord = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof HTMLButtonElement)) {
        return;
      }

      const word = event.target.getAttribute('data-word');
      if (!word) return;

      for (let i = 0; i < words.length; i += 1) {
        if (words[i] === word) {
          setCurrentWord(word);
        }
      }
    },
    [words]
  );

  const onInput = React.useCallback(
    (phoneme: Phoneme) => {
      const newSyllables = [...syllables];
      const current = newSyllables[currentSyllableIdx];
      current.phonemes.push(phoneme);
      setSyllables(newSyllables);
    },
    [currentSyllableIdx, syllables]
  );

  const toggleStress = React.useCallback(
    (idxSyllable: number) => {
      if (idxSyllable < 0 || idxSyllable >= syllables.length) return;
      const syllable: SyllableInput = { ...syllables[idxSyllable] };

      if (syllable.stress === 'primary') {
        syllable.stress = 'none';
      } else {
        // [TODO] Switch through 'secondary' as well.
        syllable.stress = 'primary';
      }

      const newSyllables = [...syllables];
      newSyllables[idxSyllable] = syllable;
      setSyllables(newSyllables);
    },
    [syllables]
  );

  const onBackspace = React.useCallback(() => {
    let newCurrentSyllable = currentSyllableIdx;
    const newSyllables: SyllableInput[] = [];
    for (let i = 0; i < syllables.length; i += 1) {
      const syllable: SyllableInput = { ...syllables[i] };
      syllable.phonemes = [...syllable.phonemes];

      if (i === currentSyllableIdx) {
        if (syllable.phonemes.length === 0 && syllables.length > 1) {
          newCurrentSyllable = Math.max(currentSyllableIdx - 1, 0);
          continue;
        }

        syllable.phonemes.pop();
        if (syllable.phonemes.length === 0) {
          syllable.stress = 'none';
        }
      }

      newSyllables.push(syllable);
    }

    setSyllables(newSyllables);
    setCurrentSyllableIdx(newCurrentSyllable);
  }, [currentSyllableIdx, syllables]);

  const addSyllable = React.useCallback(() => {
    const lastSyllable = assertDefined(syllables.at(-1));
    if (lastSyllable.phonemes.length === 0) return;

    setSyllables([...syllables, { phonemes: [] }]);
    setCurrentSyllableIdx(syllables.length);
  }, [syllables]);

  const onKeyDown = React.useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Backspace':
          onBackspace();
          break;
        case '.':
          addSyllable();
          break;
        default:
          for (const phoneme of phonemes.en.all) {
            if (phoneme.regular === event.key) {
              onInput(phoneme);
              break;
            }
          }

          break;
      }
    },
    [addSyllable, onBackspace, onInput]
  );

  const deleteSyllable = React.useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= syllables.length) return;

      if (syllables.length === 1) {
        setSyllables([{ phonemes: [] }]);
        return;
      }

      const newSyllables: SyllableInput[] = [];
      for (let i = 0; i < syllables.length; i += 1) {
        if (i === idx) continue;
        newSyllables.push(syllables[i]);
      }

      setSyllables(newSyllables);
      if (currentSyllableIdx >= newSyllables.length) {
        setCurrentSyllableIdx(newSyllables.length - 1);
      }
    },
    [currentSyllableIdx, syllables]
  );

  React.useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  React.useEffect(() => {
    if (!playingPreview || !audioPreview) return;

    lastAudio.current = new Audio(`data:audio/mp3;base64,${audioPreview}`);
    lastAudio.current.addEventListener('ended', () => {
      lastAudio.current = undefined;
      setPlayingPreview(false);
    });

    void lastAudio.current.play();
  }, [audioPreview, playingPreview]);

  const onPlayPreview = React.useCallback(() => {
    if (lastAudio.current) {
      // lastAudio.current.pause();
      lastAudio.current.src = '';
      lastAudio.current = undefined;
    }

    // x-sampa breaks if you add a stress - might be something to do with how
    // we're serializing API requests.
    const alphabetForPreview = 'ipa';

    let combinedPhonemes = '';
    for (let i = 0; i < syllables.length; i += 1) {
      const syllable = syllables[i];
      if (syllable.phonemes.length === 0) continue;

      if (i > 0) combinedPhonemes += '.';

      if (syllable.stress === 'primary') {
        combinedPhonemes += phonemes.en.stresses.primary[alphabetForPreview];
      }

      for (const phoneme of syllable.phonemes) {
        combinedPhonemes += phoneme[alphabetForPreview];
      }
    }
    setSsmlToPreview(
      `<speak>` +
        `<phoneme alphabet="${alphabetForPreview}" ph="${combinedPhonemes}" />.` +
        `</speak>`
    );
    setPlayingPreview(true);
  }, [syllables]);

  const currentSyllable = syllables[currentSyllableIdx];
  const syllableElements: JSX.Element[] = [];
  for (let i = 0; i < syllables.length; i += 1) {
    if (i > 0) {
      syllableElements.push(<Boundary key={`boundary-${i}`}>.</Boundary>);
    }

    const syllable = syllables[i];
    const canDelete = syllable.phonemes.length > 0 || i > 0;
    const canStress = syllable.phonemes.length > 0;

    const hasStress = syllable.stress === 'primary';

    let stressLabel = 'Add Primary Stress';
    let StressIcon = Icons.UpCircle;
    if (hasStress) {
      stressLabel = 'Remove Primary Stress';
      StressIcon = Icons.DownCircle;
    }
    syllableElements.push(
      <Syllable
        current={i === currentSyllableIdx}
        key={`syllable-${i}`}
        emphasize={hasStress}
      >
        <SyllableText>
          {syllable.phonemes.length === 0 && ' '}
          {hasStress && phonemes.en.stresses.primary[alphabet]}
          {syllable.phonemes.map((p, idxPhoneme) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={`${idxPhoneme}-${p.ipa}`}>{p[alphabet]}</span>
          ))}
        </SyllableText>
        {canDelete && (
          <SyllableDelete onPress={deleteSyllable} value={i}>
            <Tooltip opaque>Delete Syllable</Tooltip>
            <Icons.Delete />
          </SyllableDelete>
        )}
        {canStress && (
          <ToggleStress onPress={toggleStress} value={i}>
            <Tooltip opaque>{stressLabel}</Tooltip>
            <StressIcon />
          </ToggleStress>
        )}
      </Syllable>
    );
  }

  let nextAlphabet = alphabet;
  for (let i = 0; i < alphabets.length; i += 1) {
    if (alphabets.at(i - 1) !== alphabet) continue;

    nextAlphabet = alphabets[i];
    break;
  }

  let canPreview = false;
  {
    let phonemeCount = 0;
    for (const syllable of syllables) {
      if (phonemeCount > 1) break;
      phonemeCount += syllable.phonemes.length;
    }

    canPreview = phonemeCount > 1;
  }

  let modal: JSX.Element | undefined;
  if (currentWord) {
    const devMenu = (
      <DevMenu>
        <span>[ DEV ]</span>
        <Spacer />
        <SwitchAlphabet onPress={setSplitKeyboard} value={!splitKeyboard}>
          <Icons.Rotate /> Keyboard: {splitKeyboard ? 'split' : 'joined'}
        </SwitchAlphabet>
        <SwitchAlphabet onPress={setAlphabet} value={nextAlphabet}>
          <Icons.Rotate /> Alphabet: {alphabet}
        </SwitchAlphabet>
      </DevMenu>
    );

    modal = (
      <Modal
        actions={
          <React.Fragment>
            <Button
              icon="Done"
              variant="primary"
              onPress={setCurrentWord}
              value={undefined}
            >
              Save
            </Button>
            <Button onPress={setCurrentWord} value={undefined}>
              Cancel
            </Button>
          </React.Fragment>
        }
        content={
          <ModalContent>
            <PreviewContainer>
              <Preview>
                {syllableElements}
                {currentSyllable.phonemes.length > 0 && (
                  <AddSyllable onPress={addSyllable}>
                    <Tooltip opaque>Add Syllable</Tooltip>
                    <Icons.Add />
                  </AddSyllable>
                )}
              </Preview>
              <Backspace onPress={onBackspace}>
                <Icons.Backspace />
              </Backspace>
            </PreviewContainer>
            <P>
              <PlayPreview
                disabled={audioPreviewLoading || !canPreview}
                icon="SoundOn"
                onPress={onPlayPreview}
              >
                Preview
              </PlayPreview>
            </P>
            <KeyboardContainer>
              <Keyboard
                alphabet={alphabet}
                onInput={onInput}
                split={splitKeyboard}
              />
            </KeyboardContainer>
            {devMenu}
          </ModalContent>
        }
        title={
          <span>
            Edit Pronunciation: &quot;
            <Font weight="regular">{currentWord}</Font>&quot;
          </span>
        }
        modalWidth={ModalWidth.Wide}
      />
    );
  }

  return (
    <Container onClickCapture={disabled ? undefined : onClickWord}>
      <Words>{wordElements}</Words>
      {modal}
    </Container>
  );
}
