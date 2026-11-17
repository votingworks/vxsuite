import React, { useState } from 'react';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { type ElectionId, LanguageCode } from '@votingworks/types';
import { Button, Caption, Icons } from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import { routerPaths } from '../router_paths.js';
import { getCurrentInProgressElection } from '../api.js';
import { getNavItems } from './nav_items.js';
import {
  audioFileName,
  countMissingAudio,
  countMissingTranslations,
  type ElectionString,
  getTranslation,
  hasAudio,
  languageName,
  markAudioLoaded,
  useElectionStrings,
  useLanguageMockupState,
} from './language_mockup.js';
import {
  MockLoadButton,
  MockSaveButton,
  todayStamp,
} from './language_mockup_components.js';
import { DetailCard, DetailText, StringBrowser } from './string_browser.js';

const Player = styled.div`
  align-items: center;
  background: ${(p) => p.theme.colors.containerLow};
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: 0.5rem;
  display: flex;
  gap: 1rem;
  margin: 0.25rem 0;
  padding: 0.25rem 1rem 0.25rem 0.25rem;
`;

const Track = styled.div<{ progress: number }>`
  background: ${(p) => p.theme.colors.outline};
  border-radius: 0.25rem;
  flex-grow: 1;
  height: 0.375rem;
  position: relative;

  &::after {
    background: ${(p) => p.theme.colors.onBackground};
    border-radius: 50%;
    content: '';
    height: 1.125rem;
    left: ${(p) => p.progress * 100}%;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 1.125rem;
  }
`;

function mockDurationSeconds(string: ElectionString): number {
  const words = string.english.replace(/<[^>]+>/g, ' ').split(/\s+/).length;
  return Math.max(1, Math.round(words / 2.5));
}

function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function MockAudioPlayer({ string }: { string: ElectionString }): JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false);
  const duration = mockDurationSeconds(string);
  const position = isPlaying ? Math.min(1, duration) : 0;
  return (
    <React.Fragment>
      <Player>
        <Button
          fill="transparent"
          icon={isPlaying ? 'Pause' : 'Play'}
          onPress={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Track progress={position / duration} />
        <span>
          {formatSeconds(position)} / {formatSeconds(duration)}
        </span>
      </Player>
      <code style={{ fontSize: '0.75rem' }}>{audioFileName(string)}</code>
    </React.Fragment>
  );
}

function AudioContent({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element | null {
  const mockupState = useLanguageMockupState();
  const groups = useElectionStrings(electionId);
  const languageOptions = mockupState.enabledLanguages;
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(
    LanguageCode.ENGLISH
  );
  const languageCode = languageOptions.includes(selectedLanguage)
    ? selectedLanguage
    : LanguageCode.ENGLISH;

  if (!groups) return null;

  const name = languageName(languageCode);
  const isEnglish = languageCode === LanguageCode.ENGLISH;
  const translationsIncomplete =
    !isEnglish && countMissingTranslations(groups, languageCode) > 0;
  const missing = countMissingAudio(groups, languageCode);
  const total = groups.flatMap((group) => group.strings).length;

  let status: React.ReactNode;
  if (translationsIncomplete) {
    status = (
      <span>
        <Icons.Warning color="warning" /> Complete {name} translations before
        loading audio
      </span>
    );
  } else if (missing > 0) {
    status = (
      <span>
        <Icons.Warning color="warning" /> {missing} audio clip
        {missing === 1 ? '' : 's'} missing
      </span>
    );
  } else {
    status = (
      <span>
        <Icons.Done color="success" /> {total} audio clips loaded
      </span>
    );
  }

  return (
    <StringBrowser
      languageCode={languageCode}
      languageOptions={languageOptions}
      onChangeLanguage={setSelectedLanguage}
      groups={groups}
      lastUpdated={mockupState.audio[languageCode]?.updatedAt}
      status={status}
      actions={
        <React.Fragment>
          <MockSaveButton
            label="Save Audio Strings"
            fileType={`${name} audio strings file`}
            fileTypeTitle="Audio Strings"
            filename={`audio-${languageCode}-${todayStamp()}.zip`}
            disabled={translationsIncomplete}
          />
          <MockLoadButton
            label="Load Audio"
            loadingTitle="Loading Audio"
            loadedTitle="Audio Loaded"
            disabled={translationsIncomplete}
            onLoad={() => {
              markAudioLoaded(languageCode);
              const loaded = groups
                .flatMap((group) => group.strings)
                .filter((s) => hasAudio(languageCode, s)).length;
              return `${loaded} audio clips loaded for ${name}.`;
            }}
          />
        </React.Fragment>
      }
      isMissing={(s) => !hasAudio(languageCode, s)}
      renderDetail={(s) => (
        <React.Fragment>
          <DetailCard>
            <Caption weight="semiBold">Audio</Caption>
            {hasAudio(languageCode, s) ? (
              <MockAudioPlayer key={`${languageCode}-${s.id}`} string={s} />
            ) : (
              <DetailText string={s} />
            )}
          </DetailCard>
          <DetailCard>
            <Caption weight="semiBold">
              {isEnglish ? 'Text' : 'Translation'}
            </Caption>
            <DetailText
              string={s}
              text={getTranslation(languageCode, s.english)}
            />
          </DetailCard>
        </React.Fragment>
      )}
    />
  );
}

function AudioElectionScreen(): JSX.Element | null {
  const { electionId } = useParams<{ electionId: ElectionId }>();
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery();
  if (!getCurrentInProgressElectionQuery.isSuccess) return null;
  if (getCurrentInProgressElectionQuery.data?.electionId !== electionId) {
    return <Redirect to={routerPaths.election} />;
  }
  return (
    <NavigationScreen
      title="Audio"
      navItems={getNavItems(electionId)}
      backRouterPath={routerPaths.election}
      noPadding
    >
      <AudioContent electionId={electionId} />
    </NavigationScreen>
  );
}

export function AudioScreen(): JSX.Element {
  return (
    <Switch>
      <Route path={`${routerPaths.audio}/:electionId`}>
        <AudioElectionScreen />
      </Route>
      <Redirect to={routerPaths.election} />
    </Switch>
  );
}
