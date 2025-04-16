/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react';
import { useParams } from 'react-router-dom';

import {
  Button,
  ButtonProps,
  Caption,
  DesktopPalette,
  Font,
  Icons,
  P,
} from '@votingworks/ui';

import styled from 'styled-components';
import { LanguageCode } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import * as api from '../api';
import { ElectionIdParams } from '../routes';
import { Phoneditor } from './phoneditor';

type UiStringKey = string;
type UiString = string;
type TtsString = string;

type UiStringInfo = [UiStringKey, UiString, TtsString];

const Container = styled.div`
  box-sizing: border-box;
  display: flex;
  height: 100%;
  line-height: 1.4;
  width: 100%;
  overflow-x: scroll;
  overflow-y: hidden;
  padding: 1rem 0 2rem;

  * {
    :focus {
      outline: 0.125rem dashed ${DesktopPalette.Purple70};

      :not(:focus-visible) {
        outline: none;
      }
    }
  }
`;

const SideBar = styled.div`
  align-self: start;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border: 1px solid #ccc;
  box-shadow:
    0.05rem 0.075rem 0.1rem 0 #00000010,
    0.1rem 0.15rem 0.1rem 0.05rem #00000004,
    0.15rem 0.25rem 0.125rem 0.075rem #00000002;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  max-height: 100%;
  overflow: hidden;
  width: max(50%, 60ch);
  min-width: 50ch;
`;

const SearchBox = styled.div`
  box-shadow: 0 0.15rem 0.2rem #00000008;
  position: relative;

  svg {
    color: #aaa;
    position: absolute;
    left: 1.25rem;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  :focus-within {
    svg {
      color: ${DesktopPalette.Purple60};
    }
  }

  input {
    background: none;
    border: 0;
    border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom: 3px solid #aaa;
    margin: 0;
    padding: 0.75rem 0.5rem 0.5rem;
    padding-left: 2.5rem;
    width: 100%;

    :focus {
      border: none;
      outline: none;
      border-bottom: 3px solid ${DesktopPalette.Purple60};
    }
  }
`;

const StringSnippets = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: scroll;
  scrollbar-width: none;
  box-shadow:
    inset 0 0.15rem 0.2rem #00000008,
    inset 0 -0.15rem 0.2rem #00000008;
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding: 0 1rem 1rem;
  min-width: 50ch;
  width: 100%;
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  box-shadow:
    0.05rem 0.075rem 0.1rem 0 #00000010,
    0.1rem 0.15rem 0.1rem 0.05rem #00000004,
    0.15rem 0.25rem 0.125rem 0.075rem #00000002;
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid #ddd;
`;

// const StringPanel = styled(Card)`
//   display: flex;
//   flex-direction: column;
//   padding: 1rem;
//   border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
//   box-shadow: 0.1rem 0.15rem 0.1rem 0.05rem #00000008;
//   border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid #ddd;
// `;
const StringPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export function BallotAudioTab(): React.ReactNode {
  const [currentString, setCurrentString] = React.useState<UiStringInfo>();
  const [searchString, setSearchString] = React.useState<string>('');
  // const [searchResults, setSearchResults] = React.useState<
  //   Array<[string, string]>
  // >([]);
  const searchDebounceTimer = React.useRef<number>();

  const { electionId } = useParams<ElectionIdParams>();
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);

  const appStrings = api.appStrings.useQuery().data;
  const audioIds = api.audioIds.useQuery().data;

  const onSearch = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!appStrings) return;

      if (searchDebounceTimer.current) {
        window.clearTimeout(searchDebounceTimer.current);
        searchDebounceTimer.current = undefined;
      }

      const newSearchString = event.target.value || '';
      if (!newSearchString) return setSearchString('');

      searchDebounceTimer.current = window.setTimeout(() => {
        setSearchString(newSearchString);
      }, 50);
    },
    [appStrings]
  );

  const searchResults: UiStringInfo[] = React.useMemo(() => {
    if (!appStrings) return [];
    if (!searchString) return appStrings;

    const results: UiStringInfo[] = [];
    let resultCount = 0;
    for (let i = 0; i < appStrings.length; i += 1) {
      results[resultCount] = appStrings[i];
      resultCount += isMatchFuzzy(
        appStrings[i][1],
        searchString
      ) as unknown as number;
      delete results[resultCount];
    }

    return results;
  }, [appStrings, searchString]);

  if (!getElectionInfoQuery.data || !appStrings || !audioIds) {
    return null;
  }

  if (!currentString) {
    setCurrentString(appStrings[Math.round(Math.random() * appStrings.length)]);
  }

  return (
    <Container>
      <SideBar>
        <SearchBox>
          <Icons.Search />
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onChange={onSearch}
            placeholder="Search ballot contents"
            type="text"
            defaultValue={searchString}
          />
        </SearchBox>
        <StringSnippets>
          {searchResults.map((string) => (
            <StringSnippet
              key={string[0]}
              onPress={setCurrentString}
              selected={string[0] === currentString?.[0]}
              string={string}
            />
          ))}
        </StringSnippets>
      </SideBar>
      <Body>
        {currentString && (
          <StringPanel>
            <StringPreview
              stringKey={currentString[0]}
              text={currentString[1]}
            />
            <AudioEditor
              key={currentString[0]}
              stringKey={currentString[0]}
              ttsString={currentString[2]}
            />
          </StringPanel>
        )}
      </Body>
    </Container>
  );
}

const MAX_FUZZY_MATCH_DISTANCE_CHARS = 3;

function isMatchFuzzy(haystack: string, needle: string) {
  if (!needle) return true;
  if (!haystack) return false;

  let idxHaystack = 0;
  let idxNeedle = 0;
  let idxHaystackLastMatch = 0;
  while (idxHaystack < haystack.length && idxNeedle < needle.length) {
    const matchDistance =
      idxHaystackLastMatch && idxHaystack - idxHaystackLastMatch;

    const isMatch = (haystack[idxHaystack].toLowerCase() ===
      needle[idxNeedle].toLowerCase() &&
      matchDistance < MAX_FUZZY_MATCH_DISTANCE_CHARS) as unknown as number;
    idxNeedle += isMatch;
    idxHaystackLastMatch += (idxHaystack - idxHaystackLastMatch) * isMatch;

    idxHaystack += 1;
  }

  return idxNeedle === needle.length;
}

const StringPreviewContainer = styled(Card)`
  /* padding-bottom: 1rem;
  width: 100%; */

  p {
    /* line-height: 1.4; */
    margin: 0;
    padding: 0;

    &:not(:last-child) {
      margin-bottom: 0.5rem;
    }
  }

  table {
    margin-bottom: 0.5rem;
  }

  td {
    padding: 0.25rem;
  }
`;

const CardSectionHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StringKey = styled(Caption)`
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: flex;
  align-items: center;
  color: #333;
  padding: 0.25rem 0.5rem;
  background-color: #eee;
`;

function StringPreview(props: { stringKey: string; text: string }) {
  const { stringKey, text } = props;
  const [languageCode, setLanguageCode] = React.useState<LanguageCode>(
    LanguageCode.ENGLISH
  );

  const translation = api.translation.useQuery(stringKey, languageCode).data;
  const displayText = translation ? translation[1] : text;

  return (
    <StringPreviewContainer>
      <Font weight="bold">Display/Print Text</Font>
      <CardSectionHeader>
        {/* <Caption weight="bold">Display/Print Text</Caption> */}
        <AudioEditorTabBar role="tablist">
          <AudioEditorTab
            aria-selected={languageCode === LanguageCode.ENGLISH}
            onPress={setLanguageCode}
            role="tab"
            value={LanguageCode.ENGLISH}
          >
            <Caption weight="bold">English</Caption>
          </AudioEditorTab>
          {!stringKey.startsWith('candidateName') && (
            <React.Fragment>
              <AudioEditorTab
                aria-selected={languageCode === LanguageCode.SPANISH}
                onPress={setLanguageCode}
                role="tab"
                value={LanguageCode.SPANISH}
              >
                <Caption weight="bold">Spanish</Caption>
              </AudioEditorTab>
              <AudioEditorTab
                aria-selected={languageCode === LanguageCode.CHINESE_SIMPLIFIED}
                onPress={setLanguageCode}
                role="tab"
                value={LanguageCode.CHINESE_SIMPLIFIED}
              >
                <Caption weight="bold">Chinese (Simplified)</Caption>
              </AudioEditorTab>
            </React.Fragment>
          )}
        </AudioEditorTabBar>
        <StringKey>{stringKey}</StringKey>
      </CardSectionHeader>
      {/*  eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: displayText }} />
    </StringPreviewContainer>
  );
}

// const AudioEditorContainer = styled.div`
//   border-top: ${(p) => p.theme.sizes.bordersRem.thin}rem solid #ccc;
//   display: flex;
//   flex-direction: column;
//   padding-top: 0.5rem;
//   gap: 1rem;
//   width: 100%;
// `;
const AudioEditorContainer = styled(Card)`
  /* border-top: ${(p) => p.theme.sizes.bordersRem.thin}rem solid #ccc;
  display: flex;
  flex-direction: column;
  padding-top: 0.5rem; */

  /* gap: 1rem; */

  /* width: 100%; */
`;

const TtsTextEditor = styled.textarea`
  border-color: #eee;
  border-width: 2px;
  height: max-content + 0.5rem;
  margin: 0 0 0.5rem;
  resize: vertical;

  :focus {
    border-color: ${DesktopPalette.Purple60};
    outline: none;
  }
`;

const AudioPlayer = styled.audio`
  border-radius: 100vh;
`;

const AudioEditorTabBar = styled.div`
  display: flex;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
`;

const AudioEditorTab = styled(Button)`
  background: none;
  border-radius: 0;
  border: 0;
  box-shadow: inset 0 0 0 ${DesktopPalette.Purple40};
  color: #666;
  cursor: pointer;
  margin: 0;
  outline-offset: 2px;
  overflow: hidden;
  padding: 0.25rem 0.4rem;
  transition: 120ms ease-out;
  transition-property: background-color, border, color;

  :focus,
  :hover {
    background: none !important;
    box-shadow: inset 0 -3px 0 ${DesktopPalette.Purple40};
    color: #000;
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  }

  :active {
    background: none !important;
    outline-offset: 0;
  }

  &[aria-selected='true'] {
    box-shadow: inset 0 -3px 0 ${DesktopPalette.Purple60};
    color: #000;
  }
` as unknown as new <T>() => React.Component<ButtonProps<T>>;

const AudioControls = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
`;

const AudioRefreshButton = styled(Button)`
  background: none;
  border-radius: 100vh;
  border: 0;
  color: ${DesktopPalette.Purple70};
  cursor: pointer;
  margin: 0;
  outline-offset: 2px;
  padding: 1.25rem;
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  span {
    align-items: center;
    display: flex;
    line-height: 1;
  }

  :focus,
  :hover {
    background: ${DesktopPalette.Purple10} !important;
    color: ${DesktopPalette.Purple80};
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  }

  :active {
    background: ${DesktopPalette.Purple20} !important;
    outline-offset: 0;
  }

  &[disabled] {
    background: none;
    color: #999;

    :active,
    :focus,
    :hover {
      background: none;
      color: #999;
    }
  }
` as unknown as new <T>() => React.Component<ButtonProps<T>>;

function AudioEditor(props: { stringKey: string; ttsString: string }) {
  const { stringKey, ttsString } = props;
  const [kind, setKind] = React.useState<'tts' | 'ipa' | 'rec'>('tts');
  const [_ttsString, setTtsString] = React.useState<string>(ttsString);
  const [ttsAudioBase64, setTtsAudioBase64] = React.useState<string>();

  const textEditorRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (!textEditorRef.current) return;

    textEditorRef.current.style.height = `${
      textEditorRef.current.scrollHeight + 5
    }px`;
  }, [kind]);

  const { mutate: synthesizeSsml, isLoading: synthesizing } =
    api.synthesizeSsml.useMutation();

  function onRefresh() {
    let ssml = textEditorRef.current?.value;

    if (!ssml) return;

    if (kind === 'ipa') {
      const parts = ssml.split(' ');
      for (let i = 0; i < parts.length; i += 1) {
        parts[i] = `<phoneme alphabet="ipa" ph="${parts[i]}" />`;
      }

      ssml = parts.join(' ');
    }

    ssml = `<speak>${ssml}</speak>`;

    synthesizeSsml(
      { languageCode: 'en', ssml },
      {
        onSuccess: (data) => {
          setTtsAudioBase64(data);
        },
      }
    );
  }

  function onTtsChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setTtsString(event.target.value || '');
  }

  const disabled = synthesizing;

  let preamble: React.ReactNode = null;
  let caption: React.ReactNode = null;
  let textEditor: React.ReactNode = null;
  let controls: React.ReactNode = null;
  switch (kind) {
    case 'tts':
      preamble = <P>Edit the text below to change the corresponding audio.</P>;
      caption = (
        <Caption>
          <Icons.Info /> This will only affect audio output on ballot marking
          devices. The text will continue to appear on-screen and/or on ballots
          as shown in the section above.
        </Caption>
      );
      textEditor = (
        <TtsTextEditor
          disabled={disabled}
          key={`${stringKey}-tts`}
          onChange={onTtsChange}
          ref={textEditorRef}
          value={_ttsString}
        />
      );
      controls = (
        <AudioControls>
          <AudioPlayer
            controls
            aria-disabled={disabled}
            src={
              disabled ? undefined : `data:audio/mp3;base64,${ttsAudioBase64}`
            }
          />
          <AudioRefreshButton disabled={disabled} onPress={onRefresh}>
            <Icons.RotateRight />{' '}
          </AudioRefreshButton>
        </AudioControls>
      );
      break;
    case 'ipa':
      preamble = <P>Select a word below to add or edit a pronunciation.</P>;
      textEditor = (
        <Phoneditor
          disabled={disabled}
          key={`${stringKey}-ipa`}
          text={_ttsString}
        />
      );
      controls = (
        <AudioControls>
          <AudioPlayer
            controls
            aria-disabled={disabled}
            src={
              disabled ? undefined : `data:audio/mp3;base64,${ttsAudioBase64}`
            }
          />
          <AudioRefreshButton disabled={disabled} onPress={onRefresh}>
            <Icons.RotateRight />{' '}
          </AudioRefreshButton>
        </AudioControls>
      );
      break;
    case 'rec':
      textEditor = 'TODO';
      controls = null;
      break;

    default:
      throwIllegalValue(kind);
  }

  return (
    <AudioEditorContainer>
      <Font weight="bold">Audio</Font>
      <AudioEditorTabBar role="tablist">
        <AudioEditorTab
          aria-selected={kind === 'tts'}
          onPress={setKind}
          role="tab"
          value="tts"
        >
          <Caption weight="bold">Text-To-Speech</Caption>
        </AudioEditorTab>
        <AudioEditorTab
          aria-selected={kind === 'ipa'}
          onPress={setKind}
          role="tab"
          value="ipa"
        >
          <Caption weight="bold">Phonetic</Caption>
        </AudioEditorTab>
        <AudioEditorTab
          aria-selected={kind === 'rec'}
          onPress={setKind}
          role="tab"
          value="rec"
        >
          <Caption weight="bold">Recorded Audio</Caption>
        </AudioEditorTab>
      </AudioEditorTabBar>
      {preamble}
      {textEditor}
      {caption}
      {controls}
    </AudioEditorContainer>
  );
}

const StringSnippetContainer = styled.button`
  background: none;
  border: none;
  box-shadow: inset 0 0 0 ${DesktopPalette.Purple40};
  box-sizing: border-box;
  cursor: pointer;
  display: block;
  font-size: 1rem;
  margin: 0;
  min-height: max-content;
  overflow-x: hidden;
  overflow-y: visible;
  padding: 0.75rem;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-bottom: 1px solid #eee;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  color: #666;
  transition: 120ms ease-out;
  transition-property: border, color;

  :focus,
  :hover {
    background-color: ${DesktopPalette.Purple10};
    box-shadow: inset 0.3rem 0 0 ${DesktopPalette.Purple40};
    color: #000;
    outline: none;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20};
    box-shadow: inset 0.3rem 0 0 ${DesktopPalette.Purple60};
    color: #000;
  }
`;

function StringSnippet(props: {
  onPress: (index: UiStringInfo) => void;
  selected?: boolean;
  string: UiStringInfo;
}) {
  const { onPress, selected, string } = props;

  const onClick = React.useCallback(() => {
    onPress(string);
  }, [onPress, string]);

  return (
    <StringSnippetContainer
      aria-selected={selected}
      onClick={onClick}
      onFocus={onClick}
      type="button"
      role="option"
    >
      {string[1]}
    </StringSnippetContainer>
  );
}
