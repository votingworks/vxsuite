/* eslint-disable vx/gts-safe-number-parse */
/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react';
import { Link, Route, Switch, useHistory, useParams } from 'react-router-dom';

import {
  Button,
  ButtonProps,
  Caption,
  DesktopPalette,
  Font,
  H2,
  Icons,
  LinkButton,
  List,
  ListItem,
  P,
} from '@votingworks/ui';

import styled from 'styled-components';
import {
  AnyContest,
  CandidateContest,
  ElectionStringKey,
  LanguageCode,
  YesNoContest,
} from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { UiStringInfo } from '@votingworks/design-backend';
import * as api from '../api';
import { ElectionIdParams, electionParamRoutes, routes } from '../routes';
import { Phoneditor, PhoneticAudioControls } from './phoneditor';
import { UploadButton } from './upload_button';
import { RecordedAudio, RecordedAudioControls } from './recorded_audio';
import { AudioControls, AudioPlayer, SubHeading } from './elements';
import { UploadScreen } from './upload_screen';
import { BallotAudioPathParams } from './routes';
import { UploadsScreen } from './uploads_screen';

const Container = styled.div`
  box-sizing: border-box;
  display: flex;
  height: 100%;
  line-height: 1.4;
  width: 100%;
  overflow-x: scroll;
  overflow-y: hidden;
  padding: 1rem 0 0;

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
  gap: 1rem;
  overflow: auto;
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

const ButtonBar = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: end;
`;

export function BallotAudioTab(): React.ReactNode {
  const [searchString, setSearchString] = React.useState<string>('');
  const [filesToUpload, setFilesToUpload] = React.useState<File[]>();
  const searchDebounceTimer = React.useRef<number>();
  const lastSelectedStringUrl = React.useRef('');

  const history = useHistory();
  const { electionId, stringKey, subkey } = useParams<BallotAudioPathParams>();
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);

  const appStrings = api.appStrings.useQuery(electionId).data;
  const currentString = React.useMemo(() => {
    for (const appString of appStrings || []) {
      if (appString.key !== stringKey || appString.subkey !== subkey) continue;

      return appString;
    }
  }, [appStrings, stringKey, subkey]);

  const audioOverrideKeys = api.audioOverrideKeys.useQuery(electionId).data;

  const onSearch = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!appStrings) return;

      if (searchDebounceTimer.current) {
        window.clearTimeout(searchDebounceTimer.current);
        searchDebounceTimer.current = undefined;
      }

      const newSearchString = (event.target.value || '').trim();
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
        appStrings[i].str,
        searchString
      ) as unknown as number;
      delete results[resultCount];
    }

    return results;
  }, [appStrings, searchString]);

  const onExitUploadsScreen = React.useCallback(() => {
    history.push(
      lastSelectedStringUrl.current ||
        routes.election(electionId).ballots.ballotAudio.path
    );
    setFilesToUpload(undefined);
  }, [electionId, history]);

  if (!getElectionInfoQuery.data || !appStrings) return null;

  if (filesToUpload) {
    return (
      <UploadScreen
        files={filesToUpload}
        onDone={onExitUploadsScreen}
        onUploadMore={setFilesToUpload}
      />
    );
  }

  if (stringKey) lastSelectedStringUrl.current = history.location.pathname;

  const showStringPreview = false;

  return (
    <Switch>
      <Route path={electionParamRoutes.ballots.ballotAudioUploads.path}>
        <UploadsScreen
          onDone={onExitUploadsScreen}
          onUploadMore={setFilesToUpload}
        />
      </Route>
      <Route>
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
                <StringSnippet key={joinStringKey(string)} string={string} />
              ))}
            </StringSnippets>
          </SideBar>
          <Body>
            {currentString && (
              <StringPanel>
                {showStringPreview && (
                  <StringPreview
                    stringKey={currentString.key}
                    text={currentString.str}
                  />
                )}
                <StringInfo
                  stringKey={currentString.key}
                  subkey={currentString.subkey}
                  text={currentString.str}
                />
                <AudioEditor
                  key={joinStringKey(currentString)}
                  str={currentString}
                />
              </StringPanel>
            )}
            <ButtonBar>
              {audioOverrideKeys?.length ? (
                <ManageUploadsButton />
              ) : (
                <UploadButton onSelect={setFilesToUpload} />
              )}
            </ButtonBar>
          </Body>
        </Container>
      </Route>
    </Switch>
  );
}

// [TODO] Make this fuzzier?
function isMatchFuzzy(haystack: string, needle: string) {
  if (!needle) return true;
  if (!haystack) return false;

  let ixHaystack = 0;
  let ixNeedle = 0;
  let ixNeedleCheckpoint = 0;
  let inWord = false;
  while (ixHaystack < haystack.length && ixNeedle < needle.length) {
    const matchingSpace = needle[ixNeedle] === ' ';

    const isMatch =
      matchingSpace ||
      haystack[ixHaystack].toLowerCase() === needle[ixNeedle].toLowerCase();

    if (!inWord && !!isMatch) ixNeedleCheckpoint = ixNeedle;

    inWord = !matchingSpace && (inWord || !!isMatch);

    if (inWord && !isMatch) ixNeedle = ixNeedleCheckpoint;
    else ixNeedle += +isMatch;

    ixHaystack += 1;
  }

  return ixNeedle === needle.length;
}

const StringPreviewContainer = styled(Card)`
  > h2 {
    margin-bottom: 0;
  }

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
      <div dangerouslySetInnerHTML={{ __html: text }} />
    </StringPreviewContainer>
  );
}

function StringInfo(props: {
  stringKey: string;
  subkey?: string;
  text: string;
}) {
  const { stringKey, subkey, text } = props;

  switch (stringKey) {
    case ElectionStringKey.CANDIDATE_NAME:
      return <StringInfoCandidateName id={assertDefined(subkey)} text={text} />;

    case ElectionStringKey.CONTEST_DESCRIPTION:
      return (
        <StringInfoContestDescription id={assertDefined(subkey)} text={text} />
      );

    case ElectionStringKey.CONTEST_TITLE:
      return <StringInfoContestTitle id={assertDefined(subkey)} text={text} />;

    default:
      return (
        <StringPreviewContainer>
          <Font weight="bold">Display/Print Text</Font>
          {/*  eslint-disable-next-line react/no-danger */}
          <div dangerouslySetInnerHTML={{ __html: text }} />
        </StringPreviewContainer>
      );
  }
}

function StringInfoContestTitle(props: { id: string; text: string }) {
  const { id, text } = props;
  const { electionId } = useParams<ElectionIdParams>();

  const contests = api.listContests.useQuery(electionId).data;
  const parties = api.listParties.useQuery(electionId).data;

  if (!contests || !parties) return null;

  let contest: AnyContest | undefined;
  for (const c of contests) {
    if (c.id !== id) continue;
    contest = c;
    break;
  }

  assert(contest);

  switch (contest?.type) {
    case 'candidate':
      return <StringInfoContestTitleCandidate contest={contest} text={text} />;
    case 'yesno':
      return <StringInfoContestTitleYesNo contest={contest} text={text} />;
    default:
      throwIllegalValue(contest, 'type');
  }
}

function StringInfoContestTitleYesNo(props: {
  contest: YesNoContest;
  text: string;
}) {
  const { contest, text } = props;
  const { audioType = 'tts', electionId } = useParams<BallotAudioPathParams>();

  return (
    <StringPreviewContainer>
      <H2>{text}</H2>
      <Link
        to={
          routes
            .election(electionId)
            .ballots.ballotAudioManage(
              audioType,
              ElectionStringKey.CONTEST_DESCRIPTION,
              contest.id
            ).path
        }
        style={{ color: '#666', textDecoration: 'none' }}
      >
        {/*  eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: contest.description }} />
      </Link>
    </StringPreviewContainer>
  );
}

function StringInfoContestTitleCandidate(props: {
  contest: CandidateContest;
  text: string;
}) {
  const { contest, text } = props;
  const { audioType = 'tts', electionId } = useParams<BallotAudioPathParams>();
  const parties = api.listParties.useQuery(electionId).data;

  const candidates = React.useMemo(
    () => (
      <List maxColumns={3}>
        {contest.candidates.map((c) => (
          <ListItem key={c.id}>
            <Link
              to={
                routes
                  .election(electionId)
                  .ballots.ballotAudioManage(
                    audioType,
                    ElectionStringKey.CANDIDATE_NAME,
                    c.id
                  ).path
              }
            >
              <Caption>{c.name}</Caption>
            </Link>
          </ListItem>
        ))}
      </List>
    ),
    [audioType, contest, electionId]
  );

  if (!parties) return null;

  let contestPartyName = '';
  if (contest.partyId) {
    for (const party of parties) {
      if (party.id !== contest.partyId) continue;
      contestPartyName = party.fullName;
      break;
    }
  }

  return (
    <StringPreviewContainer>
      {contestPartyName && <SubHeading>{contestPartyName}</SubHeading>}
      <H2>{text}</H2>
      {candidates}
    </StringPreviewContainer>
  );
}

function StringInfoContestDescription(props: { id: string; text: string }) {
  const { id, text } = props;
  const { audioType = 'tts', electionId } = useParams<BallotAudioPathParams>();

  const contests = api.listContests.useQuery(electionId).data;

  if (!contests) return null;

  let contest: YesNoContest | undefined;
  for (const c of contests) {
    if (c.id !== id) continue;
    assert(c.type === 'yesno');
    contest = c;
    break;
  }

  if (!contest) return null;

  return (
    <StringPreviewContainer>
      <H2>
        <Link
          to={
            routes
              .election(electionId)
              .ballots.ballotAudioManage(
                audioType,
                ElectionStringKey.CONTEST_TITLE,
                contest.id
              ).path
          }
          style={{ color: '#666', textDecoration: 'none' }}
        >
          {contest.title}
        </Link>
      </H2>
      {/*  eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: text }} />
    </StringPreviewContainer>
  );
}

function StringInfoCandidateName(props: { id: string; text: string }) {
  const { id, text } = props;
  const { audioType = 'tts', electionId } = useParams<BallotAudioPathParams>();

  const contests = api.listContests.useQuery(electionId).data;
  const parties = api.listParties.useQuery(electionId).data;

  const [contest, candidate, party] = React.useMemo(() => {
    for (const con of contests || []) {
      if (con.type !== 'candidate') continue;

      for (const can of con.candidates) {
        if (can.id !== id) continue;

        if (!con.partyId && !can.partyIds?.length) return [con, can];

        const partyId = con.partyId || can.partyIds?.[0];
        for (const p of parties || []) {
          if (p.id !== partyId) continue;

          return [con, can, p];
        }
      }
    }

    return [];
  }, [contests, id, parties]);

  if (!candidate || !contest) return null;

  return (
    <StringPreviewContainer>
      <SubHeading>
        <Link
          to={
            routes
              .election(electionId)
              .ballots.ballotAudioManage(
                audioType,
                ElectionStringKey.CONTEST_TITLE,
                contest.id
              ).path
          }
        >
          {contest.title}
        </Link>
      </SubHeading>
      <H2>{text}</H2>
      {party && <P>{party.name}</P>}
    </StringPreviewContainer>
  );
}

const TtsTextEditor = styled.textarea`
  border-color: #eee;
  border-width: 2px;
  height: max-content + 0.5rem;
  margin: 0 0 0.25rem;
  resize: vertical;

  :focus {
    border-color: ${DesktopPalette.Purple60};
    outline: none;
  }
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
  padding: 0.125rem 0.4rem 0.25rem;
  transition-duration: 120ms;
  transition-property: background-color, border, color;
  transition-timing-function: ease-out;

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

const Note = styled(Caption)`
  color: #444;
  margin: 0 0 0.5rem 0.1rem;
`;

function AudioEditor(props: { str: UiStringInfo }) {
  const { str } = props;
  const [_ttsString, setTtsString] = React.useState<string>('');

  const {
    audioType = 'tts',
    electionId,
    stringKey,
    subkey,
  } = useParams<BallotAudioPathParams>();

  const textEditorRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (!textEditorRef.current) return;

    textEditorRef.current.style.height = `${
      textEditorRef.current.scrollHeight + 5
    }px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioType, stringKey, subkey, textEditorRef.current]);

  const { data: ttsTextOverride, isLoading: ttsTextOverrideLoading } =
    api.ttsTextOverrideGet.useQuery({
      electionId,
      key: stringKey || '',
      subkey,
    });

  const originalTtsStr = ttsTextOverride || str.ttsStr;

  React.useEffect(() => {
    setTtsString(originalTtsStr);
  }, [originalTtsStr]);

  const { mutate: ttsTextOverrideSave, isLoading: ttsTextOverrideSaving } =
    api.ttsTextOverrideSet.useMutation();

  const { data: ttsAudioDataUrl, isLoading: ttsAudioDataUrlLoading } =
    api.synthesizedText.useQuery({
      languageCode: 'en',
      text: originalTtsStr,
    });

  function onTtsChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setTtsString(event.target.value || '');
  }

  const onTtsTextSave = React.useCallback(() => {
    // [TODO] Proper html/special-char sanitization.
    const text = _ttsString.trim().replaceAll(/["<>]/g, '');

    ttsTextOverrideSave({
      electionId,
      key: assertDefined(stringKey),
      subkey,
      text,
    });

    setTtsString(text);
  }, [electionId, stringKey, subkey, ttsTextOverrideSave, _ttsString]);

  const history = useHistory();
  function setAudioType(newAudioType: 'ipa' | 'rec' | 'tts') {
    history.push(
      routes
        .election(electionId)
        .ballots.ballotAudioManage(
          newAudioType,
          assertDefined(stringKey),
          subkey
        ).path
    );
  }

  const disabled =
    ttsAudioDataUrlLoading || ttsTextOverrideLoading || ttsTextOverrideSaving;
  const ttsTextNeedsSave = originalTtsStr !== _ttsString;
  const canSave = ttsTextNeedsSave || ttsTextOverrideSaving;

  let preamble: React.ReactNode = null;
  let caption: React.ReactNode = null;
  let textEditor: React.ReactNode = null;
  let controls: React.ReactNode = null;
  switch (audioType) {
    case 'tts':
      preamble = <P>Edit the text below to change the corresponding audio.</P>;
      caption = (
        <Note>
          <Icons.Info /> This will only affect audio output on BMDs. The text
          will continue to appear as shown in the section above.
        </Note>
      );
      textEditor = (
        <TtsTextEditor
          disabled={disabled}
          onChange={onTtsChange}
          ref={textEditorRef}
          value={_ttsString}
        />
      );
      controls = (
        <AudioControls>
          <AudioPlayer
            controls
            aria-disabled={disabled || ttsTextNeedsSave}
            src={disabled || ttsTextNeedsSave ? '' : ttsAudioDataUrl}
          />
          <Button
            disabled={disabled || !canSave}
            onPress={setTtsString}
            value={originalTtsStr}
          >
            Reset
          </Button>
          <Button
            disabled={disabled || !canSave}
            icon={disabled ? 'Loading' : 'Save'}
            onPress={onTtsTextSave}
            variant={disabled || !canSave ? 'neutral' : 'primary'}
          >
            {ttsTextOverrideSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </AudioControls>
      );
      break;
    case 'ipa':
      if (str.key === ElectionStringKey.CONTEST_DESCRIPTION) {
        history.push(
          routes
            .election(electionId)
            .ballots.ballotAudioManage('tts', assertDefined(stringKey), subkey)
            .path
        );
      }
      preamble = <P>Select a word below to add or edit a pronunciation.</P>;
      textEditor = (
        <Phoneditor
          disabled={disabled}
          fallbackString={_ttsString}
          stringKey={str.key}
          subkey={str.subkey}
        />
      );
      controls = (
        <PhoneticAudioControls
          disabled={disabled}
          fallbackString={_ttsString}
          stringKey={str.key}
          subkey={str.subkey}
        />
      );
      break;
    case 'rec': {
      let { key } = str;
      switch (key) {
        case ElectionStringKey.CANDIDATE_NAME:
          key = ElectionStringKey.LA_CANDIDATE_AUDIO;
          break;

        case ElectionStringKey.CONTEST_DESCRIPTION:
        case ElectionStringKey.CONTEST_TITLE:
          key = ElectionStringKey.LA_CONTEST_AUDIO;
          break;

        default:
          break;
      }

      textEditor = <RecordedAudio stringKey={key} subkey={str.subkey} />;
      controls = <RecordedAudioControls stringKey={key} subkey={str.subkey} />;
      break;
    }

    default:
      throwIllegalValue(audioType);
  }

  return (
    <Card>
      {/* <Font weight="bold">Audio</Font> */}
      <AudioEditorTabBar role="tablist">
        <AudioEditorTab
          aria-selected={audioType === 'tts'}
          onPress={setAudioType}
          role="tab"
          value="tts"
        >
          <Caption weight="bold">Text-To-Speech</Caption>
        </AudioEditorTab>
        {str.key !== ElectionStringKey.CONTEST_DESCRIPTION && (
          <AudioEditorTab
            aria-selected={audioType === 'ipa'}
            onPress={setAudioType}
            role="tab"
            value="ipa"
          >
            <Caption weight="bold">Phonetic</Caption>
          </AudioEditorTab>
        )}
        <AudioEditorTab
          aria-selected={audioType === 'rec'}
          onPress={setAudioType}
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
    </Card>
  );
}

function ManageUploadsButton() {
  const { electionId } = useParams<BallotAudioPathParams>();

  return (
    <LinkButton
      icon="FileAudio"
      to={routes.election(electionId).ballots.ballotAudioUploads.path}
      variant="primary"
    >
      Manage Uploaded Audio
    </LinkButton>
  );
}

const StringSnippetContainer = styled(Link)`
  background: none;
  border: none;
  border-bottom: 1px solid #eee;
  box-shadow: inset 0 0 0 ${DesktopPalette.Purple40};
  box-sizing: border-box;
  color: #666 !important;
  cursor: pointer;
  display: block;
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  margin: 0;
  min-height: max-content;
  overflow-x: hidden;
  overflow-y: visible;
  padding: 0.75rem;
  text-align: left;
  text-decoration: none;
  text-overflow: ellipsis;
  transition-duration: 120ms;
  transition-property: background-color, border, color;
  transition-timing-function: ease-out;
  white-space: nowrap;

  :focus,
  :hover {
    background-color: ${DesktopPalette.Purple10} !important;
    box-shadow: inset 0.3rem 0 0 ${DesktopPalette.Purple40};
    color: #000 !important;
    filter: none !important;
    outline: none;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20} !important;
    box-shadow: inset 0.3rem 0 0 ${DesktopPalette.Purple60};
    color: #000 !important;
  }
`;

function StringSnippet(props: { string: UiStringInfo }) {
  const { string } = props;
  const {
    audioType = 'tts',
    electionId,
    stringKey,
    subkey,
  } = useParams<BallotAudioPathParams>();

  return (
    <StringSnippetContainer
      aria-selected={stringKey === string.key && subkey === string.subkey}
      to={
        routes
          .election(electionId)
          .ballots.ballotAudioManage(audioType, string.key, string.subkey).path
      }
      role="option"
    >
      {string.str}
    </StringSnippetContainer>
  );
}

function joinStringKey(info: UiStringInfo) {
  if (!info.subkey) return info.key;

  return `${info.key}.${info.subkey}`;
}
