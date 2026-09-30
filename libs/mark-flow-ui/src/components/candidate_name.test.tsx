import { expect, test } from 'vitest';
import type React from 'react';
import type { Candidate, UiStringsPackage } from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { BackendLanguageContextProvider } from '@votingworks/ui';
import { render, screen } from '../../test/react_testing_library.js';
import { CandidateName } from './candidate_name.js';

const candidate: Candidate = { id: 'horse', name: 'Horse' };

const translations: UiStringsPackage = {
  en: { candidateName: { horse: 'Horse' } },
  'zh-Hans': { candidateName: { horse: '马' } },
  'es-US': {},
};

function renderInLanguage(languageCode: string, ui: React.ReactElement) {
  return render(
    <BackendLanguageContextProvider
      currentLanguageCode={languageCode}
      uiStringsPackage={translations}
    >
      {ui}
    </BackendLanguageContextProvider>
  );
}

test('renders both names for a transliterated language when enabled', () => {
  renderInLanguage(
    'zh-Hans',
    <CandidateName candidate={candidate} shouldTransliterateCandidateNames />
  );
  screen.getByText(hasTextAcrossElements('Horse • 马'));
});

test('renders only the English name for a Latin-script language', () => {
  renderInLanguage(
    'es-US',
    <CandidateName candidate={candidate} shouldTransliterateCandidateNames />
  );
  screen.getByText('Horse');
  expect(screen.queryByText(/•/)).not.toBeInTheDocument();
});

test('renders only the English name when the setting is off', () => {
  renderInLanguage('zh-Hans', <CandidateName candidate={candidate} />);
  screen.getByText('Horse');
  expect(screen.queryByText('马')).not.toBeInTheDocument();
});
