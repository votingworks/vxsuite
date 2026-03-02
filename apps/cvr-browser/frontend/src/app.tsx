import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  Card,
  FileInputButton,
  H1,
  Icons,
  Loading,
  Main,
  MainContent,
  P,
  Screen,
} from '@votingworks/ui';
import type { CvrSource } from './cvr_source';
import { createSourceFromZip, createSourceFromFiles } from './cvr_source';
import { CvrBrowser } from './cvr_browser';

const DropTarget = styled.div<{ isDragging: boolean }>`
  border: 2px dashed
    ${(p) => (p.isDragging ? p.theme.colors.primary : p.theme.colors.outline)};
  border-radius: 0.5rem;
  padding: 3rem 4rem;
  text-align: center;
  transition: border-color 0.2s;
  max-width: 32rem;
  margin: 0 auto;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  margin-top: 1.5rem;
`;

export function App(): JSX.Element {
  const [source, setSource] = useState<CvrSource | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleZipFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const src = await createSourceFromZip(file);
      setSource(src);
    } catch (e) {
      setError(`Failed to load zip: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDirectoryFiles = useCallback((files: File[]) => {
    setLoading(true);
    setError(null);
    try {
      const src = createSourceFromFiles(files);
      setSource(src);
    } catch (e) {
      setError(
        `Failed to load directory: ${e instanceof Error ? e.message : e}`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const { files } = e.dataTransfer;
      if (files.length === 1 && files[0]?.name.endsWith('.zip')) {
        await handleZipFile(files[0]);
      } else if (files.length > 0) {
        handleDirectoryFiles(Array.from(files));
      }
    },
    [handleZipFile, handleDirectoryFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZipInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleZipFile(file);
      }
    },
    [handleZipFile]
  );

  const handleBack = useCallback(() => {
    setSource(null);
    setError(null);
  }, []);

  if (source) {
    return <CvrBrowser source={source} onBack={handleBack} />;
  }

  return (
    <Screen>
      <Main centerChild padded>
        <MainContent>
          <DropTarget
            isDragging={isDragging}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <H1>CVR Browser</H1>
            {loading ? (
              <Loading>Loading CVR data</Loading>
            ) : (
              <React.Fragment>
                <P>
                  Drop a CVR zip file or directory here, or choose a file below.
                </P>
                <ButtonRow>
                  <FileInputButton
                    accept=".zip"
                    buttonProps={{ icon: 'Import' }}
                    onChange={handleZipInput}
                  >
                    Open Zip File
                  </FileInputButton>
                  <Button icon="Import" onPress={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (input as any).webkitdirectory = true;
                    input.addEventListener('change', () => {
                      if (input.files && input.files.length > 0) {
                        handleDirectoryFiles(Array.from(input.files));
                      }
                    });
                    input.click();
                  }}>
                    Open Directory
                  </Button>
                </ButtonRow>
              </React.Fragment>
            )}
            {error && (
              <Card color="danger" style={{ marginTop: '1rem' }}>
                <P>
                  <Icons.Warning /> {error}
                </P>
              </Card>
            )}
          </DropTarget>
        </MainContent>
      </Main>
    </Screen>
  );
}
