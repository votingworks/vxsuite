import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import styled from 'styled-components';
import { safeParseNumber } from '@votingworks/types';
import type { FilterState, LogLine, StitchedLogFile } from './types';
import { isVxLogLine } from './types';
import { LogRow } from './log_row';
import {
  formatLinesForSlack,
  formatLinesAsMarkdownTable,
} from './copy_for_slack';

const LOG_ROW_HEIGHT = 28;

const Container = styled.div`
  flex: 1;
  overflow: auto;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
`;

const SelectionToolbar = styled.div`
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  gap: 0.5rem;
  background: #333;
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  font-size: 13px;
  align-items: center;
  z-index: 100;
`;

const ToolbarButton = styled.button`
  background: #555;
  color: white;
  border: none;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;

  &:hover {
    background: #666;
  }
`;

const RotationBanner = styled.div`
  background: #fff3cd;
  border: 1px solid #ffc107;
  padding: 0.25rem 1rem;
  font-size: 11px;
  font-weight: 600;
  color: #856404;
`;

function applyFilter(line: LogLine, filterState: FilterState): boolean {
  if (!isVxLogLine(line)) {
    if (filterState.searchText) {
      return line.text
        .toLowerCase()
        .includes(filterState.searchText.toLowerCase());
    }
    return true;
  }

  if (filterState.eventId && line.eventId !== filterState.eventId) return false;
  if (filterState.source && line.source !== filterState.source) return false;
  if (filterState.eventType && line.eventType !== filterState.eventType) return false;
  if (filterState.disposition && line.disposition !== filterState.disposition) return false;
  if (filterState.searchText) {
    const search = filterState.searchText.toLowerCase();
    if (
      !line.message.toLowerCase().includes(search) &&
      !line.raw.toLowerCase().includes(search)
    ) return false;
  }
  if (filterState.timeStart && line.timeLogWritten < filterState.timeStart) return false;
  if (filterState.timeEnd && line.timeLogWritten > filterState.timeEnd) return false;
  return true;
}

interface LogDisplayProps {
  readonly stitchedLog: StitchedLogFile;
  readonly filterState: FilterState;
}

export function LogDisplay({
  stitchedLog,
  filterState,
}: LogDisplayProps): JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null);
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [anchorLine, setAnchorLine] = useState<number | null>(null);

  const filteredLines = useMemo(
    () => stitchedLog.lines.filter((line) => applyFilter(line, filterState)),
    [stitchedLog, filterState]
  );

  const rotationMarkerSet = useMemo(
    () => new Set(stitchedLog.rotationMarkers.map((m) => m.lineNumber)),
    [stitchedLog]
  );

  const rotationMarkerMap = useMemo(
    () =>
      new Map(stitchedLog.rotationMarkers.map((m) => [m.lineNumber, m.date])),
    [stitchedLog]
  );

  // Parse URL hash for initial selection
  useEffect(() => {
    const { hash } = window.location;
    const match = /^#L(\d+)(?:-L(\d+))?$/.exec(hash);
    if (!match) return;
    const start = safeParseNumber(match[1]).unsafeUnwrap();
    const end = match[2] ? safeParseNumber(match[2]).unsafeUnwrap() : start;
    const lines = new Set<number>();
    for (let i = start; i <= end; i += 1) {
      lines.add(i);
    }
    setSelectedLines(lines);
    setAnchorLine(start);

    // Scroll to the line after virtualizer is ready
    requestAnimationFrame(() => {
      const idx = filteredLines.findIndex((l) => l.lineNumber >= start);
      if (idx >= 0 && parentRef.current) {
        // Approximate scroll position
        parentRef.current.scrollTop = idx * LOG_ROW_HEIGHT;
      }
    });
  }, []);

  // Update URL hash when selection changes
  useEffect(() => {
    if (selectedLines.size === 0) {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      return;
    }
    const sorted = [...selectedLines].sort((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const hash = start === end ? `#L${start}` : `#L${start}-L${end}`;
    window.history.replaceState(null, '', hash);
  }, [selectedLines]);

  const handleLineClick = useCallback(
    (lineNumber: number, e: React.MouseEvent) => {
      if (e.shiftKey && anchorLine !== null) {
        const start = Math.min(anchorLine, lineNumber);
        const end = Math.max(anchorLine, lineNumber);
        const lines = new Set<number>();
        for (let i = start; i <= end; i += 1) {
          lines.add(i);
        }
        setSelectedLines(lines);
      } else {
        setSelectedLines(new Set([lineNumber]));
        setAnchorLine(lineNumber);
      }
    },
    [anchorLine]
  );

  const selectedLogLines = useMemo(() => {
    if (selectedLines.size === 0) return [];
    return stitchedLog.lines.filter((l) => selectedLines.has(l.lineNumber));
  }, [stitchedLog, selectedLines]);

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopyForSlack = useCallback(async () => {
    const text = formatLinesForSlack(selectedLogLines);
    await navigator.clipboard.writeText(text);
    setCopyFeedback('Copied as code block');
    setTimeout(() => setCopyFeedback(null), 2000);
  }, [selectedLogLines]);

  const handleCopyAsTable = useCallback(async () => {
    const text = formatLinesAsMarkdownTable(selectedLogLines);
    await navigator.clipboard.writeText(text);
    setCopyFeedback('Copied as table');
    setTimeout(() => setCopyFeedback(null), 2000);
  }, [selectedLogLines]);

  const virtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LOG_ROW_HEIGHT,
    overscan: 50,
  });

  return (
    <Container ref={parentRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const line = filteredLines[virtualItem.index];
          const isSelected = selectedLines.has(line.lineNumber);
          const rotationDate = rotationMarkerMap.get(line.lineNumber);
          const isRotationBoundary = rotationMarkerSet.has(line.lineNumber);

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {isRotationBoundary && (
                <RotationBanner>Log rotation: {rotationDate}</RotationBanner>
              )}
              <LogRow
                line={line}
                isSelected={isSelected}
                onClick={handleLineClick}
              />
            </div>
          );
        })}
      </div>
      {selectedLines.size > 0 && (
        <SelectionToolbar>
          <span>
            {selectedLines.size} line{selectedLines.size !== 1 ? 's' : ''}{' '}
            selected
          </span>
          <ToolbarButton onClick={() => void handleCopyForSlack()}>
            Copy for Slack
          </ToolbarButton>
          <ToolbarButton onClick={() => void handleCopyAsTable()}>
            Copy as Table
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              setSelectedLines(new Set());
              setAnchorLine(null);
            }}
          >
            Clear
          </ToolbarButton>
          {copyFeedback && <span>{copyFeedback}</span>}
        </SelectionToolbar>
      )}
    </Container>
  );
}
