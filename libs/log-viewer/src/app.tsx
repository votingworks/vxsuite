import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { persistState, loadPersistedState } from './persistence';
import type { AppHistoryState } from './persistence';

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

const LoadingMessage = styled.div`
  padding: 2rem;
  text-align: center;
  color: #666;
`;

function applySelection(
  zipData: ArrayBuffer,
  zipContents: LogZipContents,
  sel: LogSelection
): StitchedLogFile | null {
  const machine = zipContents.machines.find((m) => m.id === sel.machineId);
  const session = machine?.sessions.find(
    (s) => s.timestamp === sel.sessionTimestamp
  );
  if (!session) return null;
  return stitchLogFiles(zipData, session, sel.logType);
}

export function App(): JSX.Element {
  const [zipData, setZipData] = useState<ArrayBuffer | null>(null);
  const [zipContents, setZipContents] = useState<LogZipContents | null>(null);
  const [zipFileName, setZipFileName] = useState<string>('');
  const [selection, setSelection] = useState<LogSelection | null>(null);
  const [stitchedLog, setStitchedLog] = useState<StitchedLogFile | null>(null);
  const [filterState, setFilterState] =
    useState<FilterState>(EMPTY_FILTER_STATE);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Track whether the current state change came from popstate (back/forward)
  const isPopstateRef = useRef(false);

  // Push browser history when navigation state changes
  const pushHistory = useCallback(
    (
      newSelection: LogSelection | null,
      newFilter: FilterState,
      newScrollTo: number | null
    ) => {
      if (isPopstateRef.current) return;
      const state: AppHistoryState = {
        selection: newSelection,
        filterState: newFilter,
        scrollToLine: newScrollTo,
      };
      window.history.pushState(state, '');
    },
    []
  );

  // Restore state from IndexedDB on load
  useEffect(() => {
    void (async () => {
      try {
        const persisted = await loadPersistedState();
        if (persisted) {
          const contents = parseZip(persisted.zipData);
          setZipData(persisted.zipData);
          setZipContents(contents);
          setZipFileName(persisted.zipFileName);
          if (persisted.selection) {
            setSelection(persisted.selection);
            setFilterState(persisted.filterState);
            const stitched = applySelection(
              persisted.zipData,
              contents,
              persisted.selection
            );
            setStitchedLog(stitched);
          }
        }
      } catch {
        // Ignore persistence errors
      }
      setIsLoading(false);
    })();
  }, []);

  // Listen for back/forward
  useEffect(() => {
    function handlePopState(e: PopStateEvent) {
      const state = e.state as AppHistoryState | null;
      if (!state) return;
      isPopstateRef.current = true;
      setSelection(state.selection);
      setFilterState(state.filterState);
      setScrollToLine(state.scrollToLine);
      if (state.selection && zipData && zipContents) {
        const stitched = applySelection(zipData, zipContents, state.selection);
        setStitchedLog(stitched);
      } else {
        setStitchedLog(null);
      }
      requestAnimationFrame(() => {
        isPopstateRef.current = false;
      });
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [zipData, zipContents]);

  const handleFileLoad = useCallback(async (file: File) => {
    try {
      setError(null);
      const data = await file.arrayBuffer();
      const contents = parseZip(data);
      setZipData(data);
      setZipContents(contents);
      setZipFileName(file.name);
      setSelection(null);
      setStitchedLog(null);
      setFilterState(EMPTY_FILTER_STATE);
      setScrollToLine(null);
      await persistState({
        zipData: data,
        zipFileName: file.name,
        selection: null,
        filterState: EMPTY_FILTER_STATE,
      });
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
      setScrollToLine(null);

      try {
        const stitched = applySelection(zipData, zipContents, newSelection);
        setStitchedLog(stitched);
        pushHistory(newSelection, EMPTY_FILTER_STATE, null);
        void persistState({
          zipData,
          zipFileName,
          selection: newSelection,
          filterState: EMPTY_FILTER_STATE,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse log files');
      }
    },
    [zipData, zipContents, zipFileName, pushHistory]
  );

  const handleFilterChange = useCallback(
    (newFilter: FilterState) => {
      setFilterState(newFilter);
      pushHistory(selection, newFilter, null);
      if (zipData) {
        void persistState({
          zipData,
          zipFileName,
          selection,
          filterState: newFilter,
        });
      }
    },
    [selection, zipData, zipFileName, pushHistory]
  );

  const handleViewInContext = useCallback(
    (lineNumber: number) => {
      setFilterState(EMPTY_FILTER_STATE);
      setScrollToLine(lineNumber);
      pushHistory(selection, EMPTY_FILTER_STATE, lineNumber);
      if (zipData) {
        void persistState({
          zipData,
          zipFileName,
          selection,
          filterState: EMPTY_FILTER_STATE,
        });
      }
    },
    [selection, zipData, zipFileName, pushHistory]
  );

  if (isLoading) {
    return (
      <ThemeProvider theme={DESKTOP_THEME}>
        <AppContainer>
          <MainContent>
            <LoadingMessage>Loading...</LoadingMessage>
          </MainContent>
        </AppContainer>
      </ThemeProvider>
    );
  }

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
                onFilterChange={handleFilterChange}
              />
              <LogDisplay
                stitchedLog={stitchedLog}
                filterState={filterState}
                scrollToLine={scrollToLine}
                onViewInContext={handleViewInContext}
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
