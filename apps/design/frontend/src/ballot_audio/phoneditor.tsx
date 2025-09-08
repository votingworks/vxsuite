/* eslint-disable @typescript-eslint/no-use-before-define */
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
import { SsmlChunk, TtsSyllable } from '@votingworks/design-backend';
import { useParams } from 'react-router-dom';
import { Keyboard, Phoneme } from './keyboard';
import { Tooltip, tooltipContainerCss } from './tooltip';
import { phonemes } from './phonemes';
import * as api from '../api';
import { ElectionIdParams } from '../routes';
import { AudioControls, AudioPlayer } from './elements';

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
  gap: 0.75rem;
`;

const WordContainer = styled.div`
  position: relative;

  &:hover {
    button {
      display: block;
    }
  }
`;

const Word = styled.button<{ hasEdits?: boolean }>`
  background: ${(p) => p.theme.colors.background};
  border-radius: 0.25rem;
  border: 1px solid
    ${(p) => (p.hasEdits ? ` ${DesktopPalette.Purple50}` : '#999')};
  color: ${(p) => (p.hasEdits ? p.theme.colors.primary : '#666')};
  cursor: pointer;
  outline-offset: 2px;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.5rem;
  position: relative;
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

const alphabets = ['ipa', 'x-sampa', 'regular'] as const;

const SHOW_DEV_MENU = process.env.NODE_ENV === 'development';

const EVENT_PHONEMES_EDITED = 'phonemes_edited';

export function Phoneditor(props: {
  disabled?: boolean;
  fallbackString: string;
  stringKey: string;
  subkey?: string;
}): JSX.Element {
  const { disabled, fallbackString, stringKey, subkey } = props;

  const { electionId } = useParams<ElectionIdParams>();
  const savedSsml = api.ttsPhoneticOverrideGet.useQuery({
    electionId,
    key: stringKey,
    subkey,
  }).data;

  const saveOverrideMutation = api.ttsPhoneticOverrideSet.useMutation();
  const saveOverride = saveOverrideMutation.mutateAsync;
  const savingOverride = saveOverrideMutation.isLoading;

  const clearEdits = React.useCallback(
    async (syllableIndex: number) => {
      if (!savedSsml) return;

      const ssmlChunks = [...savedSsml];
      ssmlChunks[syllableIndex].syllables = undefined;
      await saveOverride({
        electionId,
        key: stringKey,
        ssmlChunks,
        subkey,
      });
    },
    [electionId, saveOverride, savedSsml, stringKey, subkey]
  );

  const [chunks, wordElements] = React.useMemo(() => {
    const elems: JSX.Element[] = [];
    let resolvedChunks: SsmlChunk[] = [];

    if (savedSsml) {
      resolvedChunks = savedSsml;

      for (let i = 0; i < resolvedChunks.length; i += 1) {
        const { syllables } = resolvedChunks[i];

        const phoneticChunks: string[] = [];
        for (const syllable of syllables || []) {
          const syllableChunks: string[] = [];

          if (syllable.stress === 'primary') syllableChunks.push("'");
          for (const p of syllable.ipaPhonemes) {
            syllableChunks.push(
              phonemes.en.allByIpa[p as keyof typeof phonemes.en.allByIpa][
                'regular'
              ]
            );
          }

          phoneticChunks.push(syllableChunks.join(''));
        }

        elems.push(
          <WordContainer key={`${i}-${resolvedChunks[i].text}`}>
            <Word
              data-word={resolvedChunks[i].text}
              onClick={undefined}
              hasEdits={!!syllables?.length}
            >
              {syllables ? phoneticChunks.join('•') : resolvedChunks[i].text}
            </Word>
            {syllables && (
              <SyllableDelete
                disabled={savingOverride}
                onPress={clearEdits}
                value={i}
              >
                <Tooltip opaque>Clear Edits</Tooltip>
                <Icons.Delete />
              </SyllableDelete>
            )}
          </WordContainer>
        );
      }
    } else {
      const fragments = fallbackString.split(' ');

      for (let i = 0; i < fragments.length; i += 1) {
        resolvedChunks.push({ text: fragments[i] });
        elems.push(
          <Word
            data-word={fragments[i]}
            key={`${i}-${fragments[i]}`}
            onClick={undefined}
          >
            {fragments[i]}
          </Word>
        );
      }
    }

    return [resolvedChunks, elems];
  }, [clearEdits, fallbackString, savedSsml, savingOverride]);

  const [splitKeyboard, setSplitKeyboard] = React.useState(true);
  const [alphabet, setAlphabet] = React.useState<'ipa' | 'x-sampa' | 'regular'>(
    'regular'
  );
  const [currentChunk, setCurrentChunk] = React.useState<number>();
  const [syllables, setSyllables] = React.useState<TtsSyllable[]>([
    { ipaPhonemes: [] },
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
      if (!(event.target instanceof HTMLButtonElement)) return;

      const word = event.target.getAttribute('data-word');
      if (!word) return;

      for (let i = 0; i < chunks.length; i += 1) {
        if (chunks[i].text !== word) continue;

        setCurrentChunk(i);

        const chunkSyllables = chunks[i].syllables;
        if (chunkSyllables) {
          setSyllables([...chunkSyllables]);
          setCurrentSyllableIdx(chunkSyllables.length - 1);
        } else {
          setSyllables([{ ipaPhonemes: [] }]);
          setCurrentSyllableIdx(0);
        }

        break;
      }
    },
    [chunks]
  );

  const onInput = React.useCallback(
    (phoneme: Phoneme) => {
      const newSyllables = [...syllables];
      const current = newSyllables[currentSyllableIdx];
      current.ipaPhonemes.push(phoneme.ipa);
      setSyllables(newSyllables);
    },
    [currentSyllableIdx, syllables]
  );

  const toggleStress = React.useCallback(
    (idxSyllable: number) => {
      if (idxSyllable < 0 || idxSyllable >= syllables.length) return;
      const syllable: TtsSyllable = { ...syllables[idxSyllable] };

      if (syllable.stress === 'primary') {
        syllable.stress = undefined;
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
    const newSyllables: TtsSyllable[] = [];

    for (let i = 0; i < syllables.length; i += 1) {
      const syllable: TtsSyllable = { ...syllables[i] };
      syllable.ipaPhonemes = [...syllable.ipaPhonemes];

      if (i === currentSyllableIdx) {
        if (syllable.ipaPhonemes.length === 0 && syllables.length > 1) {
          newCurrentSyllable = Math.max(currentSyllableIdx - 1, 0);
          continue;
        }

        syllable.ipaPhonemes.pop();
        if (syllable.ipaPhonemes.length === 0) syllable.stress = undefined;
      }

      newSyllables.push(syllable);
    }

    setSyllables(newSyllables);
    setCurrentSyllableIdx(newCurrentSyllable);
  }, [currentSyllableIdx, syllables]);

  const addSyllable = React.useCallback(() => {
    const lastSyllable = assertDefined(syllables.at(-1));
    if (lastSyllable.ipaPhonemes.length === 0) return;

    setSyllables([...syllables, { ipaPhonemes: [] }]);
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
        setSyllables([{ ipaPhonemes: [] }]);
        return;
      }

      const newSyllables: TtsSyllable[] = [];
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

    lastAudio.current = new Audio(audioPreview);
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
      if (syllable.ipaPhonemes.length === 0) continue;

      if (i > 0) combinedPhonemes += '.';

      if (syllable.stress === 'primary') {
        combinedPhonemes += phonemes.en.stresses.primary[alphabetForPreview];
      }

      for (const phoneme of syllable.ipaPhonemes) {
        combinedPhonemes += phoneme;
      }
    }
    setSsmlToPreview(
      `<speak>` +
        `<phoneme alphabet="${alphabetForPreview}" ph="${combinedPhonemes}" />.` +
        `</speak>`
    );
    setPlayingPreview(true);
  }, [syllables]);

  function onCancel() {
    setSyllables([{ ipaPhonemes: [] }]);
    setCurrentSyllableIdx(0);
    setCurrentChunk(undefined);
  }

  async function onSave() {
    if (currentChunk === undefined) return;

    const ssmlChunks = [...chunks];
    ssmlChunks[currentChunk].syllables = syllables;
    await saveOverride({
      electionId,
      key: stringKey,
      ssmlChunks,
      subkey,
    });

    setSyllables([{ ipaPhonemes: [] }]);
    setCurrentSyllableIdx(0);
    setCurrentChunk(undefined);

    // Not getting query updates from tanstack/query when the saved SSML
    // changes, for some reason. Need to hack our way to salvation here.
    window.dispatchEvent(new Event(EVENT_PHONEMES_EDITED));
  }

  const currentSyllable = syllables[currentSyllableIdx];
  const syllableElements: JSX.Element[] = [];
  for (let i = 0; i < syllables.length; i += 1) {
    if (i > 0) {
      syllableElements.push(<Boundary key={`boundary-${i}`}>.</Boundary>);
    }

    const syllable = syllables[i];
    const canDelete = syllable.ipaPhonemes.length > 0 || i > 0;
    const canStress = syllable.ipaPhonemes.length > 0;

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
          {syllable.ipaPhonemes.length === 0 && ' '}
          {hasStress && phonemes.en.stresses.primary[alphabet]}
          {syllable.ipaPhonemes.map((p, idxPhoneme) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={`${idxPhoneme}-${p}`}>
              {
                phonemes.en.allByIpa[p as keyof typeof phonemes.en.allByIpa][
                  alphabet
                ]
              }
            </span>
          ))}
        </SyllableText>
        {canDelete && (
          <SyllableDelete
            disabled={savingOverride}
            onPress={deleteSyllable}
            value={i}
          >
            <Tooltip opaque>Delete Syllable</Tooltip>
            <Icons.Delete />
          </SyllableDelete>
        )}
        {canStress && (
          <ToggleStress
            disabled={savingOverride}
            onPress={toggleStress}
            value={i}
          >
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
      phonemeCount += syllable.ipaPhonemes.length;
    }

    canPreview = phonemeCount > 1;
  }

  let modal: JSX.Element | undefined;
  if (typeof currentChunk === 'number') {
    const devMenu = SHOW_DEV_MENU && (
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
              disabled={audioPreviewLoading || !canPreview || savingOverride}
              icon="Done"
              variant={
                audioPreviewLoading || !canPreview || savingOverride
                  ? 'neutral'
                  : 'primary'
              }
              onPress={onSave}
            >
              Save
            </Button>
            <Button onPress={onCancel}>Cancel</Button>
          </React.Fragment>
        }
        content={
          <ModalContent>
            <PreviewContainer>
              <Preview>
                {syllableElements}
                {currentSyllable.ipaPhonemes.length > 0 && (
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
                disabled={audioPreviewLoading || !canPreview || savingOverride}
                icon="SoundOn"
                onPress={onPlayPreview}
              >
                Preview
              </PlayPreview>
            </P>
            <KeyboardContainer>
              <Keyboard
                alphabet={alphabet}
                disabled={savingOverride}
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
            <Font weight="regular">{chunks[currentChunk].text}</Font>&quot;
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

export function PhoneticAudioControls(props: {
  disabled?: boolean;
  fallbackString: string;
  stringKey: string;
  subkey?: string;
}): JSX.Element {
  const { disabled, fallbackString, stringKey, subkey } = props;

  // Not getting query updates from tanstack/query when the saved SSML changes,
  // for some reason. Need to hack our way to victory here.
  const [editsDetected, setEditsDetected] = React.useState(0);

  const { electionId } = useParams<ElectionIdParams>();
  const savedSsmlQuery = api.ttsPhoneticOverrideGet.useQuery({
    electionId,
    key: stringKey,
    subkey,
  });
  const savedSsml = savedSsmlQuery.data;
  const savedSsmlLoading =
    savedSsmlQuery.isLoading || savedSsmlQuery.isFetching;

  const ssml = React.useMemo(() => {
    const chunks: string[] = ['<speak>'];

    if (savedSsml) {
      for (let i = 0; i < savedSsml.length; i += 1) {
        const { syllables, text } = savedSsml[i];
        chunks.push(syllables ? ssmlWord(syllables) : text);
      }
    } else {
      chunks.push(fallbackString);
    }

    chunks.push('</speak>');

    return chunks.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackString, savedSsml, editsDetected]);

  const dataUrlQuery = api.synthesizedSsml.useQuery({
    languageCode: 'en',
    ssml,
  });
  const dataUrl = dataUrlQuery.data;
  const dataUrlLoading = dataUrlQuery.isLoading;

  React.useEffect(() => {
    function onEditDetected() {
      window.setTimeout(() => {
        setEditsDetected(editsDetected + 1);
      }, 200);
    }

    window.addEventListener(EVENT_PHONEMES_EDITED, onEditDetected);

    return () => {
      window.removeEventListener(EVENT_PHONEMES_EDITED, onEditDetected);
    };
  }, [editsDetected]);

  const disableControls = disabled || savedSsmlLoading || dataUrlLoading;

  return (
    <AudioControls key={editsDetected}>
      <AudioPlayer
        controls
        aria-disabled={disableControls}
        src={disableControls ? undefined : dataUrl}
      />
    </AudioControls>
  );
}

function ssmlWord(syllables: TtsSyllable[]) {
  let combinedPhonemes = '';
  for (let i = 0; i < syllables.length; i += 1) {
    const syllable = syllables[i];
    if (syllable.ipaPhonemes.length === 0) continue;

    if (i > 0) combinedPhonemes += '.';

    if (syllable.stress === 'primary') {
      combinedPhonemes += phonemes.en.stresses.primary.ipa;
    }

    for (const phoneme of syllable.ipaPhonemes) combinedPhonemes += phoneme;
  }

  return `<phoneme alphabet="ipa" ph="${combinedPhonemes}" />`;
}
