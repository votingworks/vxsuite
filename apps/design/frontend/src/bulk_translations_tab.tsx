/* istanbul ignore file - DEMO */

import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  Button,
  Callout,
  Caption,
  FileInputButton,
  Font,
  Icons,
  LoadingButton,
} from '@votingworks/ui';
import fileDownload from 'js-file-download';
import { LanguageCode } from '@votingworks/types';
import { ORDERED_LANGUAGES, format } from '@votingworks/utils';
import { ElectionIdParams } from './routes';
import {
  bulkTranslationClear,
  bulkTranslationExport,
  bulkTranslationImport,
  bulkTranslationUploadsGet,
  getElectionInfo,
} from './api';
import { Column, Row } from './layout';

const List = styled.div`
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  width: fit-content;

  > *:not(:last-child) {
    border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
  }
`;

const ListItem = styled.div`
  padding: 0.75rem 1rem;
  max-width: 40rem;
`;

const ListItemHeader = styled(Row)`
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
`;

function formatUploadedAt(uploadedAt: string): string {
  return new Date(uploadedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function LanguageRow({
  electionId,
  language,
  lastUploadedAt,
}: {
  electionId: string;
  language: LanguageCode;
  lastUploadedAt?: string;
}): JSX.Element {
  const exportMutation = bulkTranslationExport.useMutation();
  const importMutation = bulkTranslationImport.useMutation();
  const clearMutation = bulkTranslationClear.useMutation();

  const displayName = format.languageDisplayName2({
    languageCode: language,
    displayLanguageCode: LanguageCode.ENGLISH,
  });

  const importResult = importMutation.isSuccess
    ? importMutation.data
    : undefined;

  return (
    <ListItem>
      <ListItemHeader>
        <div>
          <Font weight="bold">{displayName}</Font>
          <div>
            <Caption>
              {lastUploadedAt ? (
                <span>
                  <Icons.Done color="primary" /> Uploaded{' '}
                  {formatUploadedAt(lastUploadedAt)}
                </span>
              ) : (
                <span>
                  <Icons.Circle color="warning" /> No translations uploaded
                </span>
              )}
            </Caption>
          </div>
        </div>
        <Row style={{ gap: '0.5rem' }}>
          {exportMutation.isLoading ? (
            <LoadingButton>Download</LoadingButton>
          ) : (
            <Button
              icon="Export"
              onPress={() =>
                exportMutation.mutate(
                  { electionId, language },
                  {
                    onSuccess: (csv) =>
                      fileDownload(csv, `translations-${language}.csv`),
                  }
                )
              }
            >
              Download
            </Button>
          )}
          {importMutation.isLoading ? (
            <LoadingButton>Upload</LoadingButton>
          ) : (
            <FileInputButton
              accept=".csv"
              buttonProps={{ variant: 'neutral' }}
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                const csvContents = await file.text();
                importMutation.mutate({ electionId, language, csvContents });
              }}
            >
              <Icons.Import />
              Upload
            </FileInputButton>
          )}
          <Button
            icon="Trash"
            variant="danger"
            fill="transparent"
            onPress={() => clearMutation.mutate({ electionId, language })}
            disabled={lastUploadedAt === undefined || clearMutation.isLoading}
            style={{ padding: '0.6rem 0.75rem' }}
          />
        </Row>
      </ListItemHeader>
      {importResult && importResult.isErr() && (
        <Callout color="danger" icon="Danger" style={{ marginTop: '0.75rem' }}>
          <Column style={{ gap: '0.25rem' }}>
            {importResult
              .err()
              .split('\n')
              .map((line, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <Caption key={index}>{line}</Caption>
              ))}
          </Column>
        </Callout>
      )}
    </ListItem>
  );
}

export function BulkTranslationsTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const electionInfo = getElectionInfo.useQuery(electionId).data;
  const uploads = bulkTranslationUploadsGet.useQuery(electionId).data;
  if (!electionInfo || !uploads) return null;

  const languages = ORDERED_LANGUAGES.filter(
    (language) =>
      language !== LanguageCode.ENGLISH &&
      electionInfo.languageCodes.includes(language)
  );

  const uploadedAtByLanguage = new Map(
    uploads.map((upload) => [upload.languageCode, upload.uploadedAt])
  );

  return (
    <div style={{ paddingTop: '1rem' }}>
      {languages.length === 0 ? (
        <Callout icon="Info" style={{ maxWidth: '45rem' }}>
          Select languages on the Election Info screen to enable bulk
          translation.
        </Callout>
      ) : (
        <List>
          {languages.map((language) => (
            <LanguageRow
              key={language}
              electionId={electionId}
              language={language}
              lastUploadedAt={uploadedAtByLanguage.get(language)}
            />
          ))}
        </List>
      )}
    </div>
  );
}
