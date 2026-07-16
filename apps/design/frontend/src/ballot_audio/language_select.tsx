/* istanbul ignore file */

import styled from 'styled-components';

import { LanguageCode } from '@votingworks/types';
import { ORDERED_LANGUAGES, format } from '@votingworks/utils';
import {
  DesktopPalette,
  Icons,
  SearchSelect,
  useCurrentTheme,
} from '@votingworks/ui';
import { useHistory, useParams } from 'react-router-dom';
import { BallotAudioPathParams } from './routes';
import * as api from '../api';

const Container = styled.div`
  align-items: center;
  background-color: ${(p) => p.theme.colors.container};
  border: 1px solid ${DesktopPalette.Gray30};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: flex;
  min-width: 26ch;
  padding: ${(p) => p.theme.sizes.bordersRem.thin}rem
    ${(p) => p.theme.sizes.bordersRem.medium}rem;

  > * {
    > * {
      border-color: ${DesktopPalette.Gray30} !important;
      border-width: 1px !important;
      outline-offset: ${(p) => -p.theme.sizes.bordersRem.medium}rem;
    }
  }
`;

const { ENGLISH } = LanguageCode;

export function LanguageSelect(): React.ReactNode {
  const theme = useCurrentTheme();

  const params = useParams<BallotAudioPathParams>();
  const { electionId, language = ENGLISH } = params;
  const history = useHistory();

  const election = api.getElectionInfo.useQuery(electionId).data;

  function setLanguage(newLang: LanguageCode) {
    const newPath = history.location.pathname.replace(
      /language(\/[a-zA-Z-_]+|$)/,
      `language/${newLang}`
    );

    history.replace(newPath);
  }

  if (!election) return null;

  const { languageCodes } = election;
  const ordered = ORDERED_LANGUAGES.filter((l) => languageCodes.includes(l));
  if (!ordered.includes(language)) setLanguage(LanguageCode.ENGLISH);

  return (
    <Container>
      <Icons.Language
        color="neutral"
        style={{ fontSize: '1.25rem', padding: '0 0.75rem' }}
      />
      <SearchSelect
        // @ts-expect-error - shhh
        onChange={setLanguage}
        options={ordered.map((l) => ({
          label: format.languageDisplayName2({
            languageCode: l,
            displayLanguageCode: LanguageCode.ENGLISH,
          }),
          value: l,
        }))}
        style={{
          flexGrow: 1,
          backgroundColor: theme.colors.background,
          borderRadius: `${
            theme.sizes.borderRadiusRem - theme.sizes.bordersRem.medium
          }rem`,
        }}
        value={language}
      />
    </Container>
  );
}
