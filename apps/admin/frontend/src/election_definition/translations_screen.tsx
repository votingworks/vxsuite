import React, { useState } from 'react';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import { type ElectionId, LanguageCode } from '@votingworks/types';
import { Callout, Caption, H3, Icons } from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import { routerPaths } from '../router_paths.js';
import { getCurrentInProgressElection } from '../api.js';
import { getNavItems } from './nav_items.js';
import {
  countMissingTranslations,
  getTranslation,
  languageName,
  markTranslationsLoaded,
  useElectionStrings,
  useLanguageMockupState,
} from './language_mockup.js';
import {
  ManageLanguagesButton,
  MockLoadButton,
  MockSaveButton,
  todayStamp,
} from './language_mockup_components.js';
import { DetailCard, DetailText, StringBrowser } from './string_browser.js';

function TranslationsContent({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element | null {
  const mockupState = useLanguageMockupState();
  const groups = useElectionStrings(electionId);
  const languageOptions: LanguageCode[] = mockupState.enabledLanguages.filter(
    (code) => code !== LanguageCode.ENGLISH
  );
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>();
  const languageCode =
    selectedLanguage && languageOptions.includes(selectedLanguage)
      ? selectedLanguage
      : languageOptions[0];

  if (!groups) return null;

  if (!languageCode) {
    return (
      <div style={{ padding: '1rem', maxWidth: '40rem' }}>
        <Callout color="neutral" icon="Info">
          <div>
            <H3>No Additional Languages</H3>
            Ballots are English only. To add translations, add a language.
          </div>
        </Callout>
        <div style={{ marginTop: '1rem' }}>
          <ManageLanguagesButton />
        </div>
      </div>
    );
  }

  const missing = countMissingTranslations(groups, languageCode);
  const name = languageName(languageCode);

  return (
    <StringBrowser
      languageCode={languageCode}
      languageOptions={languageOptions}
      onChangeLanguage={setSelectedLanguage}
      groups={groups}
      lastUpdated={mockupState.translations[languageCode]?.updatedAt}
      status={
        missing > 0 ? (
          <span>
            <Icons.Warning color="warning" /> {missing} translation
            {missing === 1 ? '' : 's'} missing
          </span>
        ) : (
          <span>
            <Icons.Done color="success" /> All strings translated
          </span>
        )
      }
      languageActions={<ManageLanguagesButton />}
      actions={
        <React.Fragment>
          <MockSaveButton
            label="Save Translations"
            fileType={`${name} translations file`}
            fileTypeTitle="Translations"
            filename={`translations-${languageCode}-${todayStamp()}.csv`}
          />
          <MockLoadButton
            label="Load Translations"
            loadingTitle="Loading Translations"
            loadedTitle="Translations Loaded"
            onLoad={() => {
              markTranslationsLoaded(languageCode);
              const loaded = groups
                .flatMap((group) => group.strings)
                .filter(
                  (s) => getTranslation(languageCode, s.english) !== undefined
                ).length;
              return `${loaded} translations loaded for ${name}.`;
            }}
          />
        </React.Fragment>
      }
      isMissing={(s) => getTranslation(languageCode, s.english) === undefined}
      renderDetail={(s) => (
        <React.Fragment>
          <DetailCard>
            <Caption weight="semiBold">English</Caption>
            <DetailText string={s} text={s.english} />
          </DetailCard>
          <DetailCard>
            <Caption weight="semiBold">Translation</Caption>
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

function TranslationsElectionScreen(): JSX.Element | null {
  const { electionId } = useParams<{ electionId: ElectionId }>();
  const getCurrentInProgressElectionQuery =
    getCurrentInProgressElection.useQuery();
  if (!getCurrentInProgressElectionQuery.isSuccess) return null;
  if (getCurrentInProgressElectionQuery.data?.electionId !== electionId) {
    return <Redirect to={routerPaths.election} />;
  }
  return (
    <NavigationScreen
      title="Translations"
      navItems={getNavItems(electionId)}
      backRouterPath={routerPaths.election}
      noPadding
    >
      <TranslationsContent electionId={electionId} />
    </NavigationScreen>
  );
}

export function TranslationsScreen(): JSX.Element {
  return (
    <Switch>
      <Route path={`${routerPaths.translations}/:electionId`}>
        <TranslationsElectionScreen />
      </Route>
      <Redirect to={routerPaths.election} />
    </Switch>
  );
}
