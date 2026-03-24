import React, { useCallback, useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { makeTheme } from '@votingworks/ui';
import type { LogSelection, LogZipContents, StitchedLogFile } from './types';
import { EMPTY_FILTER_STATE } from './types';
import type { FilterState } from './types';
import { parseZip } from './zip_parser';
import { stitchLogFiles } from './log_parser';
import { Sidebar } from './sidebar';
import { LogDisplay } from './log_display';
import { FilterBar } from './filter_bar';

const DESKTOP_THEME = makeTheme({
  colorMode: 'desktop',
  sizeMode: 'desktop',
});

const AppContainer = styled.div`
  display: flex;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: ${(p) => p.theme.colors.background};
  color: ${(p) => p.theme.colors.foreground};
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const WelcomeContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 1rem;
`;

const DropZone = styled.label<{ isDragging: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.5rem;
  width: 400px;
  height: 200px;
  border: 2px dashed ${(p) => (p.isDragging ? p.theme.colors.primary : '#ccc')};
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
  padding: 2rem;
  text-align: center;

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
  }

  input {
    display: none;
  }
`;

export function App(): JSX.Element {
  const [zipData, setZipData] = useState<ArrayBuffer | null>(null);
  const [zipContents, setZipContents] = useState<LogZipContents | null>(null);
  const [selection, setSelection] = useState<LogSelection | null>(null);
  const [stitchedLog, setStitchedLog] = useState<StitchedLogFile | null>(null);
  const [filterState, setFilterState] =
    useState<FilterState>(EMPTY_FILTER_STATE);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);

  const handleFileLoad = useCallback(async (file: File) => {
    try {
      setError(null);
      const data = await file.arrayBuffer();
      const contents = parseZip(data);
      setZipData(data);
      setZipContents(contents);
      setSelection(null);
      setStitchedLog(null);
      setFilterState(EMPTY_FILTER_STATE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ZIP file');
    }
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFileLoad(file);
    },
    [handleFileLoad]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFileLoad(file);
    },
    [handleFileLoad]
  );

  const handleSelection = useCallback(
    (newSelection: LogSelection) => {
      if (!zipData || !zipContents) return;
      setSelection(newSelection);
      setFilterState(EMPTY_FILTER_STATE);

      const machine = zipContents.machines.find(
        (m) => m.id === newSelection.machineId
      );
      const session = machine?.sessions.find(
        (s) => s.timestamp === newSelection.sessionTimestamp
      );
      if (!session) return;

      try {
        const stitched = stitchLogFiles(zipData, session, newSelection.logType);
        setStitchedLog(stitched);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse log files');
      }
    },
    [zipData, zipContents]
  );

  return (
    <ThemeProvider theme={DESKTOP_THEME}>
      <AppContainer>
        {zipContents && (
          <Sidebar
            contents={zipContents}
            selection={selection}
            onSelect={handleSelection}
          />
        )}
        <MainContent>
          {error && (
            <div style={{ padding: '1rem', color: 'red' }}>{error}</div>
          )}
          {!zipContents ? (
            <WelcomeContainer>
              <h1>VxSuite Log Viewer</h1>
              <DropZone
                isDragging={isDragging}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <input type="file" accept=".zip" onChange={handleFileInput} />
                <p>Drop a log ZIP file here, or click to browse</p>
              </DropZone>
            </WelcomeContainer>
          ) : stitchedLog ? (
            <React.Fragment>
              <FilterBar
                stitchedLog={stitchedLog}
                filterState={filterState}
                onFilterChange={setFilterState}
              />
              <LogDisplay
                stitchedLog={stitchedLog}
                filterState={filterState}
                scrollToLine={scrollToLine}
                onViewInContext={(lineNumber) => {
                  setFilterState(EMPTY_FILTER_STATE);
                  setScrollToLine(lineNumber);
                }}
              />
            </React.Fragment>
          ) : (
            <WelcomeContainer>
              <p>Select a log file from the sidebar</p>
            </WelcomeContainer>
          )}
        </MainContent>
      </AppContainer>
    </ThemeProvider>
  );
}
