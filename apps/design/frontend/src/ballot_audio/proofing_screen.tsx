/* istanbul ignore file */

import React from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  Button,
  Caption,
  DesktopPalette,
  Font,
  H2,
  H3,
  H5,
  Icons,
  List,
  ListItem,
  P,
} from '@votingworks/ui';

import styled from 'styled-components';
import {
  CandidateContest,
  Contest,
  ElectionStringKey,
  LanguageCode,
  IS_RTL,
  NEEDS_TRANSLITERATED_NAMES,
  StraightPartyContest,
  YesNoContest,
  hasSplits,
} from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import type {
  ElectionInfo,
  TtsStringDefault,
  Translation,
} from '@votingworks/design-backend';
import * as api from '../api';
import { ElectionIdParams, routes } from '../routes';
import { BallotAudioPathParams } from './routes';
import { AudioEditor } from './audio_editor';
import { RichTextEditor } from '../rich_text_editor';
import { cssThemedScrollbars } from '../scrollbars';

const { ENGLISH } = LanguageCode;

// Candidate names aren't translated like other election strings: for
// languages written in a non-Latin script they're phonetically transliterated
// via the translation API, and for all other languages they're kept in
// English.
function stringLanguage(
  stringKey: ElectionStringKey,
  language: LanguageCode
): LanguageCode {
  return stringKey === ElectionStringKey.CANDIDATE_NAME &&
    !NEEDS_TRANSLITERATED_NAMES[language]
    ? ENGLISH
    : language;
}

const Container = styled.div`
  box-sizing: border-box;
  display: flex;
  height: 100%;
  line-height: 1.4;
  overflow-y: hidden;
  position: relative;
  width: 100%;

  a {
    color: ${(p) => p.theme.colors.primary};
    text-decoration: none;
  }
`;

const SideBarContainer = styled.div`
  padding: 1rem 0;
  max-height: 100%;
  min-width: 25ch;
  overflow: hidden;
  padding-right: 1rem;
  width: min(45%, 80ch);
`;

const SideBar = styled.div`
  align-self: start;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border: 1px solid ${DesktopPalette.Gray30};
  box-shadow: 0.125rem 0.25rem 0.5rem rgba(0, 0, 0, 10%);
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  max-height: 100%;
  overflow: hidden;
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

export const StringHeader = styled.div`
  align-items: start;
  display: flex;
  gap: 1rem;

  > :first-child {
    flex-grow: 1;
  }

  :has(> h2),
  :has(> h3) {
    > :last-child {
      margin-top: 0.125rem;
    }
  }
`;

export const SubHeading = styled(H5)`
  color: #666;
  font-size: 0.8rem;
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 1rem;
  overflow: auto;
  padding: 1rem 0;
  min-width: 50ch;
  width: 100%;

  ${cssThemedScrollbars}
`;

const FormButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: end;
`;

const StringPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const CardHeader = styled.div`
  background: ${(p) => p.theme.colors.containerLow};
  background: #f5f5f5;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${DesktopPalette.Gray20};
  padding: 0.75rem 1rem;

  > * {
    margin: 0;
  }
`;

const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0.5rem;
  max-width: 75ch;
  padding: 1rem;

  :not(:first-child) {
    padding-top: 0.5rem;
  }

  a {
    text-decoration: underline;
    text-decoration-color: transparent;
    text-decoration-thickness: ${(p) => p.theme.sizes.bordersRem.medium}rem;
    transition: text-decoration 100ms ease-out;

    :focus:focus-visible,
    :hover {
      text-decoration-color: ${(p) => p.theme.colors.primary};
      text-underline-offset: ${(p) => p.theme.sizes.bordersRem.medium}rem;
    }
  }
`;

const CardContainer = styled.div`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 75ch;
  overflow: hidden;
`;

const TextMirror = styled.pre`
  /* stylelint-disable no-empty-source */
`;

const TextArea = styled.textarea<{ editable: boolean }>`
  background: ${(p) => p.theme.colors.background};

  :disabled {
    color: ${(p) => !p.editable && p.theme.colors.onBackground};
    background: ${(p) => !p.editable && p.theme.colors.background};
    cursor: not-allowed;
  }
`;

const Editor = styled.div`
  --tts-editor-border-width: ${(p) => p.theme.sizes.bordersRem.thin}rem;
  --tts-editor-line-height: 1.4;
  --tts-editor-padding: 0.5rem 0.75rem;

  line-height: var(--tts-editor-line-height);
  position: relative;
  width: 100%;

  > ${TextArea} {
    border-width: var(--tts-editor-border-width);
    display: block;
    height: 100%;
    left: 0;
    line-height: var(--tts-editor-line-height);
    margin: 0 0 0.25rem;
    min-height: 100%;
    overflow: hidden;
    outline-offset: ${(p) => -p.theme.sizes.bordersRem.medium}rem;
    padding: var(--tts-editor-padding);
    position: absolute;
    resize: none;
    top: 0;
    width: 100%;

    ${cssThemedScrollbars}

    :focus {
      border-color: ${DesktopPalette.Purple60};
    }
  }

  ${TextMirror} {
    border: var(--tts-editor-border-width) solid transparent;
    display: block;
    font-family: inherit;
    font-size: inherit;
    height: 100%;
    line-height: var(--tts-editor-line-height);
    margin: 0;
    padding: var(--tts-editor-padding);
    visibility: hidden;
    white-space: pre-wrap;
  }
`;

export function LanguageProofingScreen(): React.ReactNode {
  const [searchString, setSearchString] = React.useState<string>('');

  const {
    electionId,
    language = ENGLISH,
    stringKey,
    subkey,
  } = useParams<BallotAudioPathParams>();
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);

  const stringDefaults = api.ttsStringDefaults.useQuery(electionId).data;
  const finalizedStrings = api.getFinalizedStrings.useQuery(
    electionId,
    language
  ).data;
  const ballotsFinalized =
    !!api.getBallotsFinalizedAt.useQuery(electionId).data;
  const currentString = React.useMemo(() => {
    for (const appString of stringDefaults || []) {
      if (appString.key !== stringKey || appString.subkey !== subkey) continue;

      return appString;
    }
  }, [stringDefaults, stringKey, subkey]);

  const searchResults: TtsStringDefault[] = React.useMemo(() => {
    if (!stringDefaults) return [];

    // [TODO] We don't yet have a concrete plan for repeated strings - de-duping
    // them in the UI for now.
    const seenStrings = new Set<string>();

    const results: TtsStringDefault[] = [];
    for (let i = 0; i < stringDefaults.length; i += 1) {
      const seen = seenStrings.has(stringDefaults[i].text);
      seenStrings.add(stringDefaults[i].text);

      if (seen || !isMatchFuzzy(stringDefaults[i].text, searchString)) {
        continue;
      }

      results.push(stringDefaults[i]);
    }

    return results;
  }, [stringDefaults, searchString]);

  if (!getElectionInfoQuery.data || !stringDefaults) return null;

  const election = getElectionInfoQuery.data;

  const finalizedSet = new Set(
    (finalizedStrings ?? []).map((f) =>
      finalizedLookupKey(f.stringKey, f.subkey)
    )
  );
  const currentFinalized =
    !!currentString &&
    finalizedSet.has(
      finalizedLookupKey(currentString.key, currentString.subkey)
    );
  // A string is locked from editing when finalized individually or when the
  // whole election's ballots have been finalized.
  let lockReason: TranslationLockReason | undefined;
  if (ballotsFinalized) {
    lockReason = 'ballotsFinalized';
  } else if (currentFinalized) {
    lockReason = 'stringFinalized';
  }

  return (
    <Container>
      <SideBarContainer>
        <SideBar>
          <SearchBox>
            <Icons.Search />
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(e) => setSearchString(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchString('');
              }}
              placeholder="Search ballot contents"
              type="text"
              value={searchString}
            />
          </SearchBox>
          <StringSnippets>
            {searchResults.map((string) => (
              <StringSnippet
                key={joinStringKey(string)}
                string={string}
                finalized={finalizedSet.has(
                  finalizedLookupKey(string.key, string.subkey)
                )}
              />
            ))}
          </StringSnippets>
        </SideBar>
      </SideBarContainer>
      <Body>
        {currentString && (
          <StringPanel>
            <FinalizeToggle
              electionId={electionId}
              language={language}
              stringKey={currentString.key}
              subkey={currentString.subkey}
              finalized={currentFinalized}
              disabled={ballotsFinalized}
            />

            <StringInfo
              stringKey={currentString.key}
              subkey={currentString.subkey}
              text={currentString.text}
            />

            {language !== ENGLISH && (
              <Translation
                electionId={electionId}
                key={`${stringKey}-${subkey}-${language}`}
                language={stringLanguage(currentString.key, language)}
                stringKey={currentString.key}
                subKey={currentString.subkey}
                lockReason={lockReason}
              />
            )}

            <LanguageAudioEditor
              election={election}
              englishDefault={currentString}
              language={stringLanguage(currentString.key, language)}
              finalized={currentFinalized}
            />
          </StringPanel>
        )}
      </Body>
    </Container>
  );
}

function LanguageAudioEditor(props: {
  election: ElectionInfo;
  language: LanguageCode;
  englishDefault: TtsStringDefault;
  finalized: boolean;
}) {
  const { election, englishDefault, language, finalized } = props;

  const translation = api.translationGet.useQuery({
    electionId: election.electionId,
    stringKey: englishDefault.key,
    language,
    subKey: englishDefault.subkey,
  }).data;

  if (!translation) return null;

  const ttsDefault: TtsStringDefault =
    language === ENGLISH
      ? englishDefault
      : { ...englishDefault, text: translation.forAudio };

  return (
    <Card header={<H3>Audio</H3>}>
      <AudioEditor
        electionId={election.electionId}
        hackyKey={`${englishDefault.key}-${englishDefault.subkey}`}
        languageCode={language}
        jurisdictionId={election.jurisdictionId}
        ttsDefault={ttsDefault}
        finalized={finalized}
      />
    </Card>
  );
}

// [TODO] Actual fuzzy match?
function isMatchFuzzy(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

// Stable lookup key for a finalized string, matching the backend's
// (stringKey, subkey) identity. A space separator is safe because string keys
// (ElectionStringKey values) never contain spaces.
function finalizedLookupKey(stringKey: string, subkey?: string): string {
  return `${stringKey} ${subkey ?? ''}`;
}

const FinalizeBar = styled.div<{ finalized: boolean }>`
  align-items: center;
  background: ${(p) =>
    p.finalized ? DesktopPalette.Purple10 : DesktopPalette.Gray5};
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  max-width: 75ch;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
`;

const FinalizeStatus = styled.div`
  align-items: center;
  display: flex;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  gap: 0.5rem;
`;

function FinalizeToggle(props: {
  electionId: string;
  language: LanguageCode;
  stringKey: ElectionStringKey;
  subkey?: string;
  finalized: boolean;
  disabled: boolean;
}) {
  const { electionId, language, stringKey, subkey, finalized, disabled } =
    props;
  const mutation = api.setStringFinalized.useMutation();

  return (
    <FinalizeBar finalized={finalized}>
      <FinalizeStatus>
        {finalized ? (
          <React.Fragment>
            <Icons.Done color="primary" /> Finalized
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Icons.Circle color="warning" /> Not Finalized
          </React.Fragment>
        )}
      </FinalizeStatus>
      <Button
        disabled={disabled || mutation.isLoading}
        icon={finalized ? 'RotateLeft' : 'Done'}
        color={finalized ? 'neutral' : 'primary'}
        fill="outlined"
        onPress={() =>
          mutation.mutate({
            electionId,
            languageCode: language,
            stringKey,
            subkey,
            finalized: !finalized,
          })
        }
      >
        {finalized ? 'Unfinalize' : 'Finalize'}
      </Button>
    </FinalizeBar>
  );
}

const TranslationContainer = styled(Card)`
  position: relative;

  > h2 {
    margin-bottom: 0;
  }

  p {
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

const StringKey = styled(Caption)`
  background-color: ${(p) => p.theme.colors.containerLow};
  border-radius: 100vh;
  color: ${(p) => p.theme.colors.onBackground};
  max-width: max-content;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.25rem 0.75rem;
  white-space: nowrap;
`;

type TranslationLockReason = 'stringFinalized' | 'ballotsFinalized';

function TranslationLockMessage(props: {
  lockReason: TranslationLockReason;
}): JSX.Element {
  const { lockReason } = props;
  return (
    <React.Fragment>
      <Icons.Lock style={{ marginRight: '0.5rem' }} />
      {lockReason === 'stringFinalized'
        ? 'This string is finalized. Unfinalize it to edit the translation.'
        : 'Ballots are finalized, so the translation may not be edited.'}
    </React.Fragment>
  );
}

function Translation(props: {
  electionId: string;
  stringKey: ElectionStringKey;
  subKey?: string;
  language: LanguageCode;
  lockReason?: TranslationLockReason;
}) {
  const { electionId, language, stringKey, subKey, lockReason } = props;
  const [edit, setEdit] = React.useState<string>();

  // Candidate names are passed through `stringLanguage`, so `language` is
  // English when the name isn't transliterated for the selected language.
  const englishOnly =
    stringKey === ElectionStringKey.CANDIDATE_NAME && language === ENGLISH;

  const translation = api.translationGet.useQuery({
    electionId,
    stringKey,
    language,
    subKey,
  }).data;

  const mutation = api.translationSet.useMutation();
  const translationSet = mutation.mutate;

  if (!translation) return null;

  const sanitizedEdit = sanitizeSingleLineText(edit);
  const saving = mutation.status === 'loading';
  const changed = edit && edit !== translation.forDisplay;
  const saveDisabled = saving || !changed || sanitizedEdit.length === 0;

  if (stringKey === ElectionStringKey.CONTEST_DESCRIPTION) {
    return (
      <RichTextTranslation
        {...props}
        key={`${stringKey}-${subKey}-${language}`}
        language={language}
        translation={translation}
      />
    );
  }

  const editable = !englishOnly && !lockReason;

  return (
    <TranslationContainer header={<H3>Translation</H3>}>
      {editable && (
        <div>
          <Icons.ChevronRight style={{ marginRight: '0.5rem' }} />
          Edit the following text to change the translation shown on voter
          ballots:
        </div>
      )}

      {englishOnly && (
        <div>
          <Icons.Info style={{ marginRight: '0.5rem' }} />
          Candidate names are displayed in English for ballots in this language.
        </div>
      )}

      {lockReason && !englishOnly && (
        <div>
          <TranslationLockMessage lockReason={lockReason} />
        </div>
      )}

      {/* [TODO] Copied from TtsTextEditor - consolidate. */}
      <Editor>
        {/*
         * Mirror the textarea's text in a background element to provide an
         * explicit height for the container (since we can't dynamically
         * grow a textarea with just CSS).
         *
         * The extra period just ensures that the `Mirror` grows accordingly
         * when the last character inserted is a newline (the newline is
         * otherwise ignored by the browser, it seems).
         */}
        <TextMirror>{edit || translation.forDisplay}.</TextMirror>

        <TextArea
          dir={IS_RTL[language] ? 'rtl' : undefined}
          editable={editable}
          disabled={saving || !editable}
          id="ttsTextEditor"
          name="ttsText"
          onChange={(event) => setEdit(event.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
          }}
          value={edit || translation.forDisplay}
        />
      </Editor>
      {editable && (
        <FormButtons>
          {changed && (
            <Button
              disabled={saving}
              onPress={setEdit}
              value={undefined}
              type="reset"
            >
              Cancel
            </Button>
          )}
          <Button
            disabled={saveDisabled}
            icon={saving ? 'Loading' : 'Save'}
            onPress={translationSet}
            value={{
              electionId,
              language,
              stringKey,
              subKey,
              text: sanitizedEdit,
            }}
            type="submit"
            variant={saveDisabled ? 'neutral' : 'primary'}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </FormButtons>
      )}
    </TranslationContainer>
  );
}

function sanitizeSingleLineText(raw: string = '') {
  return raw.trim().replaceAll(/\r\n\t/g, ' ');
}

const DescriptionEditor = styled(RichTextEditor)`
  background: ${(p) => p.theme.colors.background};
`;

// [TODO] Trim down to just the `DescriptionEditor`, now that this is mostly
// aligned with the plain `Translation` component.
function RichTextTranslation(props: {
  electionId: string;
  language: LanguageCode;
  stringKey: ElectionStringKey;
  subKey?: string;
  translation: Translation;
  lockReason?: TranslationLockReason;
}) {
  const { electionId, language, stringKey, subKey, translation, lockReason } =
    props;
  const readOnly = !!lockReason;
  const [edit, setEdit] = React.useState<string>();
  const [resets, setResets] = React.useState<number>(0);

  const mutation = api.translationSet.useMutation();
  const translationSet = mutation.mutate;

  const saving = false;
  const changed = edit && edit !== translation.forDisplay;
  const saveDisabled = saving || !changed;

  return (
    <TranslationContainer header={<H3>Translation</H3>}>
      <div>
        {lockReason ? (
          <TranslationLockMessage lockReason={lockReason} />
        ) : (
          <React.Fragment>
            <Icons.ChevronRight style={{ marginRight: '0.5rem' }} />
            Edit the following text to change the translation shown on voter
            ballots:
          </React.Fragment>
        )}
      </div>
      <DescriptionEditor
        dir={IS_RTL[language] ? 'rtl' : undefined}
        disabled={readOnly}
        initialHtmlContent={edit || translation.forDisplay}
        key={`${stringKey}-${subKey}-${language}-${resets}`}
        onChange={setEdit}
      />
      {!readOnly && (
        <FormButtons>
          {changed && (
            <Button
              disabled={saving}
              onPress={() => {
                setEdit(undefined);
                setResets(resets + 1);
              }}
              type="reset"
            >
              Cancel
            </Button>
          )}
          <Button
            disabled={saveDisabled}
            icon={saving ? 'Loading' : 'Save'}
            onPress={translationSet}
            value={{
              electionId,
              language,
              stringKey,
              subKey,
              text: edit || '',
            }}
            type="submit"
            variant={saveDisabled ? 'neutral' : 'primary'}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </FormButtons>
      )}
    </TranslationContainer>
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
      return <StringInfoCandidateName id={assertDefined(subkey)} />;

    case ElectionStringKey.CONTEST_DESCRIPTION:
      return <StringInfoContestDescription id={assertDefined(subkey)} />;

    case ElectionStringKey.CONTEST_OPTION_LABEL:
      return <StringInfoContestOption id={assertDefined(subkey)} />;

    case ElectionStringKey.CONTEST_TERM:
      return <StringInfoContestTerm id={assertDefined(subkey)} />;

    case ElectionStringKey.CONTEST_TITLE:
      return <StringInfoContestTitle id={assertDefined(subkey)} text={text} />;

    case ElectionStringKey.DISTRICT_NAME:
      return <StringInfoSimple label="District Name" text={text} />;

    case ElectionStringKey.ELECTION_TITLE:
      return <StringInfoSimple label="Election Title" text={text} />;

    case ElectionStringKey.JURISDICTION_NAME:
      return <StringInfoSimple label="Jurisdiction Name" text={text} />;

    case ElectionStringKey.PARTY_FULL_NAME:
      return <StringInfoSimple label="Party Full Name" text={text} />;

    case ElectionStringKey.PARTY_NAME:
      return <StringInfoSimple label="Party Short Name" text={text} />;

    case ElectionStringKey.POLLING_PLACE_NAME:
      return <StringInfoSimple label="Polling Place Name" text={text} />;

    case ElectionStringKey.PRECINCT_NAME:
      return <StringInfoPrecinctName id={assertDefined(subkey)} />;

    case ElectionStringKey.PRECINCT_SPLIT_NAME:
      return <StringInfoPrecinctSplitName id={assertDefined(subkey)} />;

    case ElectionStringKey.STATE_NAME:
      return <StringInfoSimple label="State Name" text={text} />;

    default:
      return (
        <TranslationContainer>
          <StringHeader>
            <H2>{text}</H2>
          </StringHeader>
        </TranslationContainer>
      );
  }
}

function StringInfoPrecinctName(props: { id: string }) {
  const { id } = props;
  const { electionId, language = ENGLISH } = useParams<BallotAudioPathParams>();

  const precincts = api.listPrecincts.useQuery(electionId).data;

  const precinct = React.useMemo(() => {
    for (const p of precincts || []) {
      if (p.id === id) return p;
    }

    return undefined;
  }, [id, precincts]);

  if (!precinct) return null;

  let splits: JSX.Element | undefined;
  if (hasSplits(precinct)) {
    splits = (
      <List maxColumns={3}>
        {precinct.splits.map((split) => (
          <ListItem key={split.id}>
            <Link
              to={
                routes.election(electionId).ballots.languageManage({
                  language,
                  stringKey: ElectionStringKey.PRECINCT_SPLIT_NAME,
                  subkey: split.id,
                }).path
              }
            >
              <Caption>{split.name}</Caption>
            </Link>
          </ListItem>
        ))}
      </List>
    );
  }

  return (
    <TranslationContainer>
      <StringHeader>
        <H2>{precinct.name}</H2>
        <StringKey>Precinct Name</StringKey>
      </StringHeader>
      {splits}
    </TranslationContainer>
  );
}

function StringInfoPrecinctSplitName(props: { id: string }) {
  const { id } = props;
  const { language = ENGLISH, electionId } = useParams<BallotAudioPathParams>();

  const precincts = api.listPrecincts.useQuery(electionId).data;

  const [precinct, split] = React.useMemo(() => {
    for (const p of precincts || []) {
      if (!hasSplits(p)) continue;

      for (const s of p.splits) {
        if (s.id === id) return [p, s];
      }
    }

    return [undefined, undefined];
  }, [id, precincts]);

  if (!split) return null;

  return (
    <TranslationContainer>
      <StringHeader>
        <div>
          <SubHeading>
            <Link
              to={
                routes.election(electionId).ballots.languageManage({
                  language,
                  stringKey: ElectionStringKey.PRECINCT_NAME,
                  subkey: precinct.id,
                }).path
              }
            >
              {precinct.name}
            </Link>
          </SubHeading>
          <H2>{split.name}</H2>
        </div>
        <StringKey>Precinct Split Name</StringKey>
      </StringHeader>
    </TranslationContainer>
  );
}

function StringInfoSimple(props: { label: string; text: string }) {
  const { label, text } = props;

  return (
    <TranslationContainer>
      <StringHeader>
        <H2>{text}</H2>
        <StringKey>{label}</StringKey>
      </StringHeader>
    </TranslationContainer>
  );
}

function StringInfoContestTerm(props: { id: string }) {
  const { id } = props;
  const { language = ENGLISH, electionId } = useParams<BallotAudioPathParams>();

  const contests = api.listContests.useQuery(electionId).data;

  const contest = React.useMemo(() => {
    for (const con of contests || []) {
      if (con.type !== 'candidate') continue;
      if (con.id !== id) continue;
      return con;
    }

    return undefined;
  }, [contests, id]);

  if (!contest) return null;

  return (
    <TranslationContainer>
      <StringHeader>
        <div>
          <SubHeading>
            <Link
              to={
                routes.election(electionId).ballots.languageManage({
                  language,
                  stringKey: ElectionStringKey.CONTEST_TITLE,
                  subkey: contest.id,
                }).path
              }
            >
              {contest.title}
            </Link>
          </SubHeading>
          <H2>{contest.termDescription}</H2>
        </div>
        <StringKey>Contest Term</StringKey>
      </StringHeader>
    </TranslationContainer>
  );
}

function StringInfoContestOption(props: { id: string }) {
  const { id } = props;
  const { language = ENGLISH, electionId } = useParams<BallotAudioPathParams>();

  const contests = api.listContests.useQuery(electionId).data;

  const [contest, option] = React.useMemo(() => {
    for (const con of contests || []) {
      if (con.type !== 'yesno') continue;

      for (const opt of con.options) {
        if (opt.id !== id) continue;
        return [con, opt];
      }
    }

    return [];
  }, [contests, id]);

  if (!option || !contest) return null;

  return (
    <TranslationContainer>
      <StringHeader>
        <div>
          <SubHeading>
            <Link
              to={
                routes.election(electionId).ballots.languageManage({
                  language,
                  stringKey: ElectionStringKey.CONTEST_TITLE,
                  subkey: contest.id,
                }).path
              }
            >
              {contest.title}
            </Link>
          </SubHeading>
          <H2>{option.label}</H2>
        </div>
        <StringKey>Ballot Measure Label</StringKey>
      </StringHeader>
    </TranslationContainer>
  );
}

function StringInfoContestTitle(props: { id: string; text: string }) {
  const { id, text } = props;
  const { electionId } = useParams<ElectionIdParams>();

  const contests = api.listContests.useQuery(electionId).data;
  const parties = api.listParties.useQuery(electionId).data;

  if (!contests || !parties) return null;

  let contest: Contest | undefined;
  for (const c of contests) {
    if (c.id !== id) continue;
    contest = c;
    break;
  }

  assert(contest);

  switch (contest?.type) {
    case 'candidate':
      return <StringInfoContestTitleCandidate contest={contest} text={text} />;
    case 'straight-party':
      return (
        <StringInfoContestTitleStraightParty contest={contest} text={text} />
      );
    case 'yesno':
      return <StringInfoContestTitleYesNo contest={contest} text={text} />;
    default:
      throwIllegalValue(contest, 'type');
  }
}

const DescriptionPreview = styled.div`
  max-height: 1.4rem;
  overflow: hidden;
  position: relative;
  text-overflow: ellipsis;
  white-space: nowrap !important;

  > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
`;

function StringInfoContestTitleYesNo(props: {
  contest: YesNoContest;
  text: string;
}) {
  const { contest, text } = props;
  const { language = ENGLISH, electionId } = useParams<BallotAudioPathParams>();

  return (
    <TranslationContainer>
      <StringHeader>
        <H2>{text}</H2>
        <StringKey>Contest Title</StringKey>
      </StringHeader>
      <Link
        to={
          routes.election(electionId).ballots.languageManage({
            language,
            stringKey: ElectionStringKey.CONTEST_DESCRIPTION,
            subkey: contest.id,
          }).path
        }
        style={{ textDecoration: 'none', fontWeight: 'initial' }}
      >
        <DescriptionPreview
          dangerouslySetInnerHTML={{ __html: contest.description }}
        />
      </Link>
    </TranslationContainer>
  );
}

function StringInfoContestTitleCandidate(props: {
  contest: CandidateContest;
  text: string;
}) {
  const { contest, text } = props;
  const { language = ENGLISH, electionId } = useParams<BallotAudioPathParams>();
  const parties = api.listParties.useQuery(electionId).data;

  const candidates = React.useMemo(
    () => (
      <List maxColumns={3}>
        {contest.candidates.map((c) => (
          <ListItem key={c.id}>
            <Link
              to={
                routes.election(electionId).ballots.languageManage({
                  language,
                  stringKey: ElectionStringKey.CANDIDATE_NAME,
                  subkey: c.id,
                }).path
              }
            >
              <Caption>{c.name}</Caption>
            </Link>
          </ListItem>
        ))}
      </List>
    ),
    [contest.candidates, electionId, language]
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
    <TranslationContainer>
      <StringHeader>
        <div>
          {contestPartyName && <SubHeading>{contestPartyName}</SubHeading>}
          <H2>{text}</H2>
        </div>
        <StringKey>Contest Title</StringKey>
      </StringHeader>
      {candidates}
    </TranslationContainer>
  );
}

function StringInfoContestTitleStraightParty(props: {
  contest: StraightPartyContest;
  text: string;
}) {
  const { contest, text } = props;
  if (!contest) return null;

  return (
    <TranslationContainer>
      <StringHeader>
        <H2>{text}</H2>
        <StringKey>Contest Title</StringKey>
      </StringHeader>
    </TranslationContainer>
  );
}

function StringInfoContestDescription(props: { id: string }) {
  const { id } = props;
  const { language = ENGLISH, electionId } = useParams<BallotAudioPathParams>();

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
    <TranslationContainer>
      <StringHeader>
        <Font>
          <Link
            to={
              routes.election(electionId).ballots.languageManage({
                language,
                stringKey: ElectionStringKey.CONTEST_TITLE,
                subkey: contest.id,
              }).path
            }
            style={{ textDecoration: 'none' }}
          >
            {contest.title}
          </Link>
        </Font>
        <StringKey>Contest Description</StringKey>
      </StringHeader>
      {/*  eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: contest.description }} />
    </TranslationContainer>
  );
}

function StringInfoCandidateName(props: { id: string }) {
  const { id } = props;
  const { language = ENGLISH, electionId } = useParams<BallotAudioPathParams>();

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
    <TranslationContainer>
      <StringHeader>
        <div>
          <SubHeading>
            <Link
              to={
                routes.election(electionId).ballots.languageManage({
                  language,
                  stringKey: ElectionStringKey.CONTEST_TITLE,
                  subkey: contest.id,
                }).path
              }
            >
              {contest.title}
            </Link>
          </SubHeading>
          <H2>{candidate.name}</H2>
        </div>
        <StringKey>Candidate Name</StringKey>
      </StringHeader>
      {party && <P>{party.name}</P>}
    </TranslationContainer>
  );
}

const StringSnippetContainer = styled(Link)`
  background: none;
  border: none;
  border-bottom: 1px solid #eee;
  box-shadow: inset 0 0 0 ${DesktopPalette.Purple40};
  box-sizing: border-box;
  align-items: center;
  color: ${(p) => p.theme.colors.onBackground} !important;
  cursor: pointer;
  display: flex;
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular} !important;
  gap: 0.5rem;
  margin: 0;
  min-height: max-content;
  overflow-x: hidden;
  overflow-y: visible;
  padding: 0.75rem;
  text-align: left;
  text-decoration: none;
  transition-duration: 120ms;
  transition-property: background-color, border, color;
  transition-timing-function: ease-out;

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
    color: ${(p) => p.theme.colors.primary} !important;
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold} !important;
  }
`;

const SnippetText = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

function StringSnippet(props: {
  string: TtsStringDefault;
  finalized: boolean;
}) {
  const { string, finalized } = props;
  const {
    electionId,
    stringKey,
    language = ENGLISH,
    subkey,
  } = useParams<BallotAudioPathParams>();

  return (
    <StringSnippetContainer
      aria-selected={stringKey === string.key && subkey === string.subkey}
      to={
        routes.election(electionId).ballots.languageManage({
          language,
          stringKey: string.key,
          subkey: string.subkey,
        }).path
      }
      role="option"
    >
      <SnippetText>{string.text}</SnippetText>
      {finalized ? (
        <Icons.Done color="primary" style={{ flexShrink: 0 }} />
      ) : (
        <Icons.Circle color="warning" style={{ flexShrink: 0 }} />
      )}
    </StringSnippetContainer>
  );
}

function joinStringKey(info: TtsStringDefault) {
  if (!info.subkey) return info.key;

  return `${info.key}.${info.subkey}`;
}

function Card(props: {
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
}) {
  const { children, className, header } = props;

  return (
    <CardContainer className={className}>
      {header && <CardHeader>{header}</CardHeader>}
      <CardBody>{children}</CardBody>
    </CardContainer>
  );
}
