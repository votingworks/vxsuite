import React from 'react';
import {
  type Candidate,
  ElectionStringKey,
  isLanguageCode,
  NEEDS_TRANSLITERATED_NAMES,
} from '@votingworks/types';
import { electionStrings, UiString, useCurrentLanguage } from '@votingworks/ui';

export interface CandidateNameProps {
  candidate: Candidate;
  shouldTransliterateCandidateNames?: boolean;
}

export function CandidateName(props: CandidateNameProps): JSX.Element {
  const { candidate, shouldTransliterateCandidateNames } = props;
  const currentLanguageCode = useCurrentLanguage();
  const englishName = electionStrings.candidateName(candidate);

  const showTransliteratedName =
    Boolean(shouldTransliterateCandidateNames) &&
    isLanguageCode(currentLanguageCode) &&
    NEEDS_TRANSLITERATED_NAMES[currentLanguageCode];

  if (!showTransliteratedName) {
    return englishName;
  }

  return (
    <React.Fragment>
      {englishName}
      {' • '}
      <UiString
        uiStringKey={ElectionStringKey.CANDIDATE_NAME}
        uiStringSubKey={candidate.id}
      >
        {candidate.name}
      </UiString>
    </React.Fragment>
  );
}
