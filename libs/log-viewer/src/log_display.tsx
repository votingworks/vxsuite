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
import { LogRow, LogRowHeader, DEFAULT_COLUMN_WIDTHS } from './log_row';
import type { ColumnWidths } from './log_row';
import { copyAsRichText, copyAsPlainText } from './copy_for_slack';

const LOG_ROW_HEIGHT = 28;

const VX_LOG_TYPES = new Set(['vx-logs.log', 'vx-logs.errors.log']);

const OuterContainer = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
`;

const ScrollContainer = styled.div`
  flex: 1;
  overflow: auto;
`;

const SelectionToolbar = styled.div`
  display: flex;
  gap: 0.5rem;
  font-size: 13px;
  align-items: center;
  padding: 0.5rem 0;
  margin-bottom: 0.25rem;
  border-bottom: 1px solid #e0e0e0;
`;

const ToolbarButton = styled.button`
  background: #e8e8e8;
  color: #333;
  border: 1px solid #ccc;
  padding: 0.25rem 0.625rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;

  &:hover {
    background: #ddd;
  }
`;

const DetailPanel = styled.div`
  border-top: 2px solid #ddd;
  padding: 0.75rem 1rem;
  background: #fafafa;
  font-size: 12px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  flex-shrink: 0;
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
`;

const DetailKey = styled.span`
  color: #666;
  font-weight: 600;
`;

const DetailValue = styled.span`
  white-space: pre-wrap;
  word-break: break-all;
`;

function formatDetailValue(value: string): string {
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

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

function hasActiveFilters(filterState: FilterState): boolean {
  return Boolean(
    filterState.eventId ||
      filterState.source ||
      filterState.eventType ||
      filterState.disposition ||
      filterState.searchText ||
      filterState.timeStart ||
      filterState.timeEnd
  );
}

interface LogDisplayProps {
  readonly stitchedLog: StitchedLogFile;
  readonly filterState: FilterState;
  readonly scrollToLine?: number | null;
  readonly onViewInContext?: (lineNumber: number) => void;
}

export function LogDisplay({
  stitchedLog,
  filterState,
  scrollToLine,
  onViewInContext,
}: LogDisplayProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(
    DEFAULT_COLUMN_WIDTHS
  );

  const handleColumnResize = useCallback(
    (column: keyof ColumnWidths, width: number) => {
      setColumnWidths((prev) => ({ ...prev, [column]: width }));
    },
    []
  );
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

  const isFiltered = hasActiveFilters(filterState);
  const isVxLog = VX_LOG_TYPES.has(stitchedLog.logType);
  const showSource = !filterState.source;

  // Parse URL hash on mount to restore line selection
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
    requestAnimationFrame(() => {
      const idx = filteredLines.findIndex((l) => l.lineNumber >= start);
      if (idx >= 0 && scrollRef.current) {
        scrollRef.current.scrollTop = idx * LOG_ROW_HEIGHT;
      }
    });
  }, []);

  // Update URL hash when selection changes
  useEffect(() => {
    if (selectedLines.size === 0) {
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    const sorted = [...selectedLines].toSorted((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const hash = start === end ? `#L${start}` : `#L${start}-L${end}`;
    window.history.replaceState(null, '', hash);
  }, [selectedLines]);

  // Scroll to a specific line when requested
  useEffect(() => {
    if (scrollToLine === null || scrollToLine === undefined) return;
    const idx = filteredLines.findIndex((l) => l.lineNumber >= scrollToLine);
    if (idx >= 0) {
      setSelectedLines(new Set([scrollToLine]));
      setAnchorLine(scrollToLine);
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = idx * LOG_ROW_HEIGHT;
        }
      });
    }
  }, [scrollToLine, filteredLines]);

  const isDraggingRef = useRef(false);

  const selectFilteredRange = useCallback(
    (from: number, to: number) => {
      const start = Math.min(from, to);
      const end = Math.max(from, to);
      const lines = new Set(
        filteredLines
          .filter((l) => l.lineNumber >= start && l.lineNumber <= end)
          .map((l) => l.lineNumber)
      );
      setSelectedLines(lines);
    },
    [filteredLines]
  );

  const handleLineMouseDown = useCallback(
    (lineNumber: number, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (e.shiftKey && anchorLine !== null) {
        selectFilteredRange(anchorLine, lineNumber);
      } else {
        setSelectedLines(new Set([lineNumber]));
        setAnchorLine(lineNumber);
        isDraggingRef.current = true;
      }
    },
    [anchorLine, selectFilteredRange]
  );

  const handleLineMouseEnter = useCallback(
    (lineNumber: number) => {
      if (!isDraggingRef.current || anchorLine === null) return;
      selectFilteredRange(anchorLine, lineNumber);
    },
    [anchorLine, selectFilteredRange]
  );

  useEffect(() => {
    function handleMouseUp() {
      isDraggingRef.current = false;
    }
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const singleSelectedLine = useMemo(() => {
    if (selectedLines.size !== 1) return null;
    const lineNumber = [...selectedLines][0];
    return stitchedLog.lines.find((l) => l.lineNumber === lineNumber) ?? null;
  }, [stitchedLog, selectedLines]);

  const selectedLogLines = useMemo(() => {
    if (selectedLines.size === 0) return [];
    return stitchedLog.lines.filter((l) => selectedLines.has(l.lineNumber));
  }, [stitchedLog, selectedLines]);

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopyRich = useCallback(async () => {
    await copyAsRichText(selectedLogLines);
    setCopyFeedback('Copied as table');
    setTimeout(() => setCopyFeedback(null), 2000);
  }, [selectedLogLines]);

  const handleCopyPlain = useCallback(async () => {
    await copyAsPlainText(selectedLogLines);
    setCopyFeedback('Copied as text');
    setTimeout(() => setCopyFeedback(null), 2000);
  }, [selectedLogLines]);

  const virtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LOG_ROW_HEIGHT,
    overscan: 50,
  });

  return (
    <OuterContainer>
      <ScrollContainer ref={scrollRef}>
        <LogRowHeader
          isVxLog={isVxLog}
          showSource={showSource}
          columnWidths={columnWidths}
          onColumnResize={handleColumnResize}
        />
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: 'max-content',
            minWidth: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const line = filteredLines[virtualItem.index];
            const isSelected = selectedLines.has(line.lineNumber);
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
                  ...(isRotationBoundary
                    ? {
                        borderTop: '2px solid #ffc107',
                        background: '#fffbeb',
                      }
                    : {}),
                }}
              >
                <LogRow
                  line={line}
                  isSelected={isSelected}
                  showSource={showSource}
                  columnWidths={columnWidths}
                  onMouseDown={handleLineMouseDown}
                  onMouseEnter={handleLineMouseEnter}
                />
              </div>
            );
          })}
        </div>
      </ScrollContainer>
      {selectedLines.size > 0 && (
        <DetailPanel>
          <SelectionToolbar>
            <span>
              {selectedLines.size} line{selectedLines.size !== 1 ? 's' : ''}{' '}
              selected
            </span>
            {isFiltered && onViewInContext && selectedLines.size === 1 && (
              <ToolbarButton
                onClick={() => onViewInContext([...selectedLines][0])}
              >
                View in Context
              </ToolbarButton>
            )}
            <ToolbarButton onClick={() => void handleCopyRich()}>
              Copy Table
            </ToolbarButton>
            <ToolbarButton onClick={() => void handleCopyPlain()}>
              Copy Text
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
          {singleSelectedLine &&
            isVxLogLine(singleSelectedLine) &&
            Object.keys(singleSelectedLine.extra).length > 0 && (
              <DetailGrid>
                {Object.entries(singleSelectedLine.extra).map(
                  ([key, value]) => (
                    <React.Fragment key={key}>
                      <DetailKey>{key}</DetailKey>
                      <DetailValue>{formatDetailValue(value)}</DetailValue>
                    </React.Fragment>
                  )
                )}
              </DetailGrid>
            )}
        </DetailPanel>
      )}
    </OuterContainer>
  );
}
