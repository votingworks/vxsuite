/* istanbul ignore file - demo */

import {
  Button,
  ButtonProps,
  Caption,
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
import {
  IS_RTL,
  LanguageCode,
  phonemes,
  PhoneticSyllable,
  PhoneticWord,
} from '@votingworks/types';
import { Keyboard, Phoneme } from './keyboard';
import * as api from '../api';
import { cssThemedScrollbars } from '../scrollbars';
import { Tooltip, tooltipContainerCss } from '../tooltip';

export const AudioControls = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
`;

export const AudioPlayer = styled.audio`
  border-radius: 100vh;
`;

const Body = styled.div`
  background: ${(p) => p.theme.colors.containerLow};
  border: 2px solid ${(p) => p.theme.colors.containerLow};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  margin: 0 0 0.5rem;
  padding: 1rem;
  overflow-y: auto;
  resize: none;
  transition: 120ms ease-out;
  transition-property: background, border, color;

  :focus-within {
    border-color: ${DesktopPalette.Purple60};
    outline: none;
  }
`;

const Container = styled.div`
  display: grid;
  grid-template-rows: max-content min-content;
  height: 100%;
  overflow-y: auto;

  ${cssThemedScrollbars}
`;

const Header = styled(Font)`
  display: block;
  padding: 0 0 0.5rem;
  margin: 0;
  z-index: 1;
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
  border: 1px solid
    ${(p) => (p.hasEdits ? ` ${DesktopPalette.Purple50}` : '#999')};
  border-radius: 0.25rem;
  color: ${(p) => (p.hasEdits ? p.theme.colors.primary : '#666')};
  cursor: pointer;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  outline-offset: ${(p) => -p.theme.sizes.bordersRem.medium}rem;
  padding: 0.5rem;
  position: relative;
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  :not(:disabled) {
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
  }

  :disabled {
    cursor: not-allowed;
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
  background-color: #eee;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border: 1px solid #aaa;
  display: flex;
  flex-grow: 1;
  font-size: 3rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
  min-width: max-content;
  padding: 1.25rem 1.5rem;

  /* Border overrides: */
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
  border-radius: 100vh;
  border: none;
  color: ${DesktopPalette.Purple70};
  cursor: pointer;
  display: none;
  font-size: 1.25rem;
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
  transform: translate(-40%, -40%);
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
  border-top-left-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border-top-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  cursor: pointer;
  display: flex;
  font-weight: ${(p) =>
    p.emphasize ? 900 : p.theme.sizes.fontWeight.semiBold};
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

const Note = styled(Caption)`
  color: #444;
  display: block;
  margin: 0 0 0.5rem 0.1rem;
  padding-top: 0.5rem;
`;

const Footer = styled.div`
  background: ${(p) => p.theme.colors.background};
  bottom: 0;
  gap: 0.5rem;
  padding: 0.5rem 0 0.125rem;
  position: sticky;
`;

const alphabets = ['ipa', 'vx'] as const;

const SHOW_DEV_MENU = process.env.NODE_ENV === 'development';

const IDEOGRAPHIC_LANGS: LanguageCode[] = [
  LanguageCode.CHINESE_SIMPLIFIED,
  LanguageCode.CHINESE_TRADITIONAL,
];

export interface PhoneditorProps {
  editable?: boolean;
  jurisdictionId: string;
  languageCode: LanguageCode;
  original: string;
}

export function Phoneditor(props: PhoneditorProps): JSX.Element {
  const { editable, jurisdictionId, languageCode, original } = props;

  const savedEdit = api.ttsEditsGet.useQuery({
    jurisdictionId,
    languageCode,
    original,
  }).data;
  const savedSsml = savedEdit?.phonetic;

  const { mutateAsync: save, isLoading: saving } =
    api.ttsEditsSet.useMutation();

  const clearEdits = React.useCallback(
    async (syllableIndex: number) => {
      if (!savedSsml) return;

      const ssmlChunks = [...savedSsml];
      ssmlChunks[syllableIndex].syllables = undefined;

      const hasAnyPhonetics = ssmlChunks.some((c) => !!c.syllables);

      await save({
        jurisdictionId,
        original,
        languageCode,
        data: {
          exportSource: hasAnyPhonetics ? 'phonetic' : 'text',
          phonetic: hasAnyPhonetics ? ssmlChunks : [],
          text: savedEdit.text,
        },
      });
    },
    [jurisdictionId, languageCode, original, save, savedEdit?.text, savedSsml]
  );

  const [splitKeyboard, setSplitKeyboard] = React.useState(true);
  const [alphabet, setAlphabet] = React.useState<'ipa' | 'vx'>('vx');
  const [currentChunk, setCurrentChunk] = React.useState<number>();
  const [syllables, setSyllables] = React.useState<PhoneticSyllable[]>([
    { ipaPhonemes: [] },
  ]);
  const [currentSyllableIdx, setCurrentSyllableIdx] = React.useState(
    syllables.length - 1
  );
  const [playingPreview, setPlayingPreview] = React.useState(false);
  const [ssmlToPreview, setSsmlToPreview] = React.useState('');
  const lastAudio = React.useRef<HTMLAudioElement>();

  const audioPreviewQuery = api.ttsSynthesizeFromSsml.useQuery({
    languageCode,
    ssml: ssmlToPreview,
  });
  const audioPreview = audioPreviewQuery.data;
  const audioPreviewLoading = audioPreviewQuery.isLoading;

  function onClickWord(p: { chunk: PhoneticWord; idx: number }) {
    setCurrentChunk(p.idx);

    const chunkSyllables = p.chunk.syllables;
    if (chunkSyllables) {
      setSyllables([...chunkSyllables]);
      setCurrentSyllableIdx(chunkSyllables.length - 1);
    } else {
      setSyllables([{ ipaPhonemes: [] }]);
      setCurrentSyllableIdx(0);
    }
  }

  const [chunks, wordElements] = React.useMemo(() => {
    const elems: JSX.Element[] = [];
    let resolvedChunks: PhoneticWord[] = [];

    if (savedSsml?.length) {
      resolvedChunks = savedSsml;

      for (let i = 0; i < resolvedChunks.length; i += 1) {
        const chunk = resolvedChunks[i];

        const phoneticChunks: React.ReactNode[] = [];
        for (const [syllableIdx, syllable] of (
          chunk.syllables || []
        ).entries()) {
          const syllableChunks: string[] = [];

          if (syllable.stress === 'primary') {
            syllableChunks.push(phonemes.en.stresses.primary.ipa);
          }

          for (const p of syllable.ipaPhonemes) {
            syllableChunks.push(phonemes.en.allByIpa[p]['vx']);
          }

          const joinedSyllable = syllableChunks.join('');
          phoneticChunks.push(
            <Font
              key={joinedSyllable}
              weight={syllable.stress === 'primary' ? 'bold' : 'regular'}
            >
              {joinedSyllable}
            </Font>
          );
          if (syllableIdx + 1 !== chunk.syllables?.length) {
            phoneticChunks.push(
              <Font key={`${joinedSyllable}-sep`}> &bull; </Font>
            );
          }
        }

        elems.push(
          <WordContainer key={`${i}-${resolvedChunks[i].text}`}>
            <Word
              disabled={!editable}
              onClick={() => onClickWord({ chunk, idx: i })}
              hasEdits={!!chunk.syllables?.length}
            >
              {chunk.syllables ? phoneticChunks : resolvedChunks[i].text}
            </Word>
            {chunk.syllables && editable && (
              <SyllableDelete disabled={saving} onPress={clearEdits} value={i}>
                <Icons.Delete />
              </SyllableDelete>
            )}
          </WordContainer>
        );
      }
    } else {
      const fragments = IDEOGRAPHIC_LANGS.includes(languageCode)
        ? splitIdeographic(original)
        : original.split(' ');

      for (let i = 0; i < fragments.length; i += 1) {
        resolvedChunks.push({ text: fragments[i] });
        elems.push(
          <Word
            disabled={!editable}
            key={`${i}-${fragments[i]}`}
            onClick={() =>
              onClickWord({ chunk: { text: fragments[i] }, idx: i })
            }
          >
            {fragments[i]}
          </Word>
        );
      }
    }

    return [resolvedChunks, elems];
  }, [clearEdits, editable, languageCode, original, savedSsml, saving]);

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
      const syllable: PhoneticSyllable = { ...syllables[idxSyllable] };

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
    const newSyllables: PhoneticSyllable[] = [];

    for (let i = 0; i < syllables.length; i += 1) {
      const syllable: PhoneticSyllable = { ...syllables[i] };
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

  const onPlayPreview = React.useCallback(() => {
    if (lastAudio.current) {
      lastAudio.current.src = '';
      lastAudio.current = undefined;
    }

    setSsmlToPreview(`<speak>${ssmlWord(syllables)}</speak>`);
    setPlayingPreview(true);
  }, [syllables]);

  const onKeyDown = React.useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        switch (event.key) {
          case 'b':
            toggleStress(currentSyllableIdx);
            return;

          default:
            return;
        }
      }

      switch (event.key) {
        case 'Enter':
          onPlayPreview();
          break;

        case 'Backspace':
          onBackspace();
          break;

        case '.':
        case ' ':
          addSyllable();
          break;

        default: {
          for (const phoneme of Object.values(phonemes.en.allByIpa)) {
            if ('shortcut' in phoneme && phoneme.shortcut === event.key) {
              onInput(phoneme);
              break;
            }
          }
        }
      }
    },
    [
      addSyllable,
      currentSyllableIdx,
      onBackspace,
      onInput,
      onPlayPreview,
      toggleStress,
    ]
  );

  const deleteSyllable = React.useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= syllables.length) return;

      if (syllables.length === 1) {
        setSyllables([{ ipaPhonemes: [] }]);
        return;
      }

      const newSyllables: PhoneticSyllable[] = [];
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

  function onCancel() {
    setSyllables([{ ipaPhonemes: [] }]);
    setCurrentSyllableIdx(0);
    setCurrentChunk(undefined);
  }

  async function onSave() {
    if (currentChunk === undefined) return;

    const ssmlChunks = [...chunks];
    ssmlChunks[currentChunk].syllables = syllables;

    await save({
      jurisdictionId,
      languageCode,
      original,
      data: {
        exportSource: 'phonetic',
        phonetic: ssmlChunks,
        text: savedEdit?.text || original,
      },
    });

    setSyllables([{ ipaPhonemes: [] }]);
    setCurrentSyllableIdx(0);
    setCurrentChunk(undefined);
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
              {phonemes.en.allByIpa[p][alphabet]}
            </span>
          ))}
        </SyllableText>
        {canDelete && (
          <SyllableDelete disabled={saving} onPress={deleteSyllable} value={i}>
            <Tooltip opaque>Delete Syllable</Tooltip>
            <Icons.Delete />
          </SyllableDelete>
        )}
        {canStress && (
          <ToggleStress disabled={saving} onPress={toggleStress} value={i}>
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
              disabled={audioPreviewLoading || !canPreview || saving}
              icon="Done"
              variant={
                audioPreviewLoading || !canPreview || saving
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
                disabled={audioPreviewLoading || !canPreview || saving}
                icon="SoundOn"
                onPress={onPlayPreview}
              >
                Preview
              </PlayPreview>
            </P>
            <KeyboardContainer>
              <Keyboard
                alphabet={alphabet}
                disabled={saving}
                languageCode={languageCode}
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
    <Container>
      <Header>
        <Icons.ChevronRight style={{ marginRight: '0.5rem' }} />
        {editable
          ? 'Pick a word below to edit its phonetic pronunciation:'
          : 'Audio will be generated from the following:'}
      </Header>
      <Body dir={IS_RTL[languageCode] ? 'rtl' : undefined}>
        <Words>{wordElements}</Words>
      </Body>
      {modal}
      <Footer>
        <Note>
          <Icons.Info /> This will only affect audio output on BMDs. The text
          will continue to appear as shown in the section above.
        </Note>

        <PhoneticAudioControls
          jurisdictionId={jurisdictionId}
          languageCode={languageCode}
          original={original}
          disabled={!editable}
        />
      </Footer>
    </Container>
  );
}

// [TODO] Very rough sketch. Clean up, extend to non-ideographic text, and
// handle splitting at punctuation/symbol boundaries too.
function splitIdeographic(text: string) {
  const chunks: string[] = [];

  let nextChunk: string[] = [];
  for (const codepointStr of text) {
    const codepoint = codepointStr.codePointAt(0);
    if (!codepoint) continue;

    if (codepoint > 0xff) {
      if (nextChunk.length) {
        chunks.push(nextChunk.join(''));
        nextChunk = [];
      }

      chunks.push(codepointStr);
      continue;
    }

    if (/\s/.test(codepointStr)) {
      if (nextChunk.length) {
        chunks.push(nextChunk.join(''));
        nextChunk = [];
      }
      continue;
    }

    nextChunk.push(codepointStr);
  }

  if (nextChunk.length) {
    chunks.push(nextChunk.join(''));
    nextChunk = [];
  }

  return chunks;
}

export interface PhoneticAudioControlsProps {
  disabled?: boolean;
  languageCode: string;
  jurisdictionId: string;
  original: string;
}

export function PhoneticAudioControls(
  props: PhoneticAudioControlsProps
): JSX.Element {
  const { disabled, jurisdictionId, languageCode, original } = props;

  const savedEdit = api.ttsEditsGet.useQuery({
    jurisdictionId,
    languageCode,
    original,
  }).data;
  const savedSsml = savedEdit?.phonetic;

  const ssml = React.useMemo(() => {
    const chunks: string[] = ['<speak>'];

    if (savedSsml) {
      for (let i = 0; i < savedSsml.length; i += 1) {
        const { syllables, text } = savedSsml[i];
        chunks.push(syllables ? ssmlWord(syllables) : text);
      }
    } else {
      chunks.push(original);
    }

    chunks.push('</speak>');

    return chunks.join(' ');
  }, [original, savedSsml]);

  const dataUrlQuery = api.ttsSynthesizeFromSsml.useQuery({
    languageCode,
    ssml,
  });
  const dataUrl = dataUrlQuery.data;
  const dataUrlLoading = dataUrlQuery.isLoading;

  const disableControls = disabled || dataUrlLoading;

  return (
    <AudioControls>
      <AudioPlayer
        controls
        aria-disabled={disableControls}
        src={disableControls ? undefined : dataUrl}
      />
    </AudioControls>
  );
}

function ssmlWord(syllables: PhoneticSyllable[]) {
  let combinedPhonemes = '';
  for (let i = 0; i < syllables.length; i += 1) {
    const syllable = syllables[i];
    if (syllable.ipaPhonemes.length === 0) continue;

    if (syllable.stress === 'primary') {
      combinedPhonemes += phonemes.en.stresses.primary.ipa;
    } else if (syllable.stress === 'secondary') {
      combinedPhonemes += phonemes.en.stresses.secondary.ipa;
    } else if (i > 0) {
      combinedPhonemes += '.';
    }

    for (const phoneme of syllable.ipaPhonemes) combinedPhonemes += phoneme;
  }

  return `<phoneme alphabet="ipa" ph="${combinedPhonemes}" />`;
}
