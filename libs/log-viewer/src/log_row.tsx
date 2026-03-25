import React, { useCallback, useRef } from 'react';
import styled from 'styled-components';
import type { LogLine } from './types';
import { isVxLogLine } from './types';

export interface ColumnWidths {
  readonly time: number;
  readonly source: number;
  readonly event: number;
  readonly message: number;
  readonly details: number;
}

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  time: 130,
  source: 180,
  event: 220,
  message: 300,
  details: 400,
};

const Row = styled.div<{ isSelected: boolean }>`
  display: flex;
  align-items: stretch;
  min-width: max-content;
  height: 28px;
  background: ${(p) => (p.isSelected ? '#e8f0fe' : 'transparent')};
  cursor: pointer;
  user-select: none;

  &:hover {
    background: ${(p) => (p.isSelected ? '#d2e3fc' : '#f5f5f5')};
  }
`;

const HeaderRowContainer = styled.div`
  display: flex;
  align-items: stretch;
  min-width: max-content;
  height: 28px;
  background: #f0f0f0;
  border-bottom: 2px solid #ddd;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  color: #666;
  position: sticky;
  top: 0;
  z-index: 10;
`;

const LineNumber = styled.span`
  display: flex;
  align-items: center;
  min-width: 40px;
  width: 40px;
  padding: 0 0.25rem;
  color: #999;
  text-align: right;
  justify-content: flex-end;
  border-right: 1px solid #ddd;
  flex-shrink: 0;
`;

const Cell = styled.span<{ width?: number }>`
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  white-space: nowrap;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  border-right: 1px solid #eee;
  width: ${(p) => (p.width ? `${p.width}px` : 'auto')};
`;

const HeaderCell = styled(Cell)`
  position: relative;
`;

const ResizeHandle = styled.div`
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  border-right: 1px solid #ddd;

  &:hover {
    border-right: 2px solid #999;
  }
`;

const TimeCell = styled(Cell)`
  color: #666;
`;

const SourceCell = styled(Cell)`
  color: #0066cc;
`;

const EventCell = styled(Cell)`
  color: #8b5cf6;
`;

const RawTextCell = styled(Cell)`
  min-width: 400px;
`;

interface LogRowProps {
  readonly line: LogLine;
  readonly isSelected: boolean;
  readonly showSource: boolean;
  readonly columnWidths: ColumnWidths;
  readonly onMouseDown: (lineNumber: number, e: React.MouseEvent) => void;
  readonly onMouseEnter: (lineNumber: number) => void;
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function serializeExtra(extra: Readonly<Record<string, string>>): string {
  const entries = Object.entries(extra);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${v}`).join(' ');
}

interface LogRowHeaderProps {
  readonly isVxLog: boolean;
  readonly showSource: boolean;
  readonly columnWidths: ColumnWidths;
  readonly onColumnResize: (column: keyof ColumnWidths, width: number) => void;
}

function ResizableHeaderCell({
  column,
  width,
  onColumnResize,
  children,
}: {
  readonly column: keyof ColumnWidths;
  readonly width: number;
  readonly onColumnResize: (column: keyof ColumnWidths, width: number) => void;
  readonly children: React.ReactNode;
}): JSX.Element {
  const startX = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startX.current = e.clientX;
      startWidthRef.current = width;

      function handleMouseMove(moveEvent: MouseEvent) {
        const delta = moveEvent.clientX - startX.current;
        const newWidth = Math.max(60, startWidthRef.current + delta);
        onColumnResize(column, newWidth);
      }

      function handleMouseUp() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [column, width, onColumnResize]
  );

  return (
    <HeaderCell width={width}>
      {children}
      <ResizeHandle onMouseDown={handleMouseDown} />
    </HeaderCell>
  );
}

export function LogRowHeader({
  isVxLog,
  showSource,
  columnWidths,
  onColumnResize,
}: LogRowHeaderProps): JSX.Element {
  if (isVxLog) {
    return (
      <HeaderRowContainer>
        <LineNumber>#</LineNumber>
        <ResizableHeaderCell
          column="time"
          width={columnWidths.time}
          onColumnResize={onColumnResize}
        >
          Time
        </ResizableHeaderCell>
        {showSource && (
          <ResizableHeaderCell
            column="source"
            width={columnWidths.source}
            onColumnResize={onColumnResize}
          >
            Source
          </ResizableHeaderCell>
        )}
        <ResizableHeaderCell
          column="event"
          width={columnWidths.event}
          onColumnResize={onColumnResize}
        >
          Event
        </ResizableHeaderCell>
        <ResizableHeaderCell
          column="message"
          width={columnWidths.message}
          onColumnResize={onColumnResize}
        >
          Message
        </ResizableHeaderCell>
        <ResizableHeaderCell
          column="details"
          width={columnWidths.details}
          onColumnResize={onColumnResize}
        >
          Details
        </ResizableHeaderCell>
      </HeaderRowContainer>
    );
  }
  return (
    <HeaderRowContainer>
      <LineNumber>#</LineNumber>
      <RawTextCell>Log Line</RawTextCell>
    </HeaderRowContainer>
  );
}

export function LogRow({
  line,
  isSelected,
  showSource,
  columnWidths,
  onMouseDown,
  onMouseEnter,
}: LogRowProps): JSX.Element {
  if (isVxLogLine(line)) {
    const extraText = serializeExtra(line.extra);
    return (
      <Row
        isSelected={isSelected}
        onMouseDown={(e) => onMouseDown(line.lineNumber, e)}
        onMouseEnter={() => onMouseEnter(line.lineNumber)}
      >
        <LineNumber>{line.lineNumber}</LineNumber>
        <TimeCell width={columnWidths.time}>
          {formatTimestamp(line.timeLogWritten)}
        </TimeCell>
        {showSource && (
          <SourceCell width={columnWidths.source}>{line.source}</SourceCell>
        )}
        <EventCell width={columnWidths.event}>{line.eventId}</EventCell>
        <Cell width={columnWidths.message} title={line.message}>
          {line.message}
        </Cell>
        <Cell width={columnWidths.details} title={extraText}>
          {extraText}
        </Cell>
      </Row>
    );
  }

  return (
    <Row
      isSelected={isSelected}
      onMouseDown={(e) => onMouseDown(line.lineNumber, e)}
      onMouseEnter={() => onMouseEnter(line.lineNumber)}
    >
      <LineNumber>{line.lineNumber}</LineNumber>
      <RawTextCell>{line.text}</RawTextCell>
    </Row>
  );
}
