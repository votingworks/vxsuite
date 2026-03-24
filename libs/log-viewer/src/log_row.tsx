import React from 'react';
import styled from 'styled-components';
import type { LogLine } from './types';
import { isVxLogLine } from './types';

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

const HeaderRow = styled.div`
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
  min-width: 50px;
  width: 50px;
  padding: 0 0.5rem;
  color: #999;
  text-align: right;
  justify-content: flex-end;
  border-right: 1px solid #eee;
  flex-shrink: 0;
`;

const Cell = styled.span`
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  white-space: nowrap;
  flex-shrink: 0;
`;

const TimeCell = styled(Cell)`
  width: 160px;
  color: #666;
`;

const SourceCell = styled(Cell)`
  width: 180px;
  color: #0066cc;
`;

const EventCell = styled(Cell)`
  width: 280px;
  color: #8b5cf6;
`;

const DispositionCell = styled(Cell)`
  width: 70px;
  color: ${(p: { disposition?: string }) => {
    switch (p.disposition) {
      case 'success':
        return '#16a34a';
      case 'failure':
        return '#dc2626';
      default:
        return '#999';
    }
  }};
`;

const MessageCell = styled(Cell)`
  min-width: 400px;
`;

const RawTextCell = styled(Cell)`
  min-width: 400px;
`;

interface LogRowProps {
  readonly line: LogLine;
  readonly isSelected: boolean;
  readonly onClick: (lineNumber: number, e: React.MouseEvent) => void;
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
      fractionalSecondDigits: 3,
      hour12: false,
    });
  } catch {
    return ts;
  }
}

export function LogRowHeader({
  isVxLog,
}: {
  readonly isVxLog: boolean;
}): JSX.Element {
  if (isVxLog) {
    return (
      <HeaderRow>
        <LineNumber>#</LineNumber>
        <TimeCell>Time</TimeCell>
        <SourceCell>Source</SourceCell>
        <EventCell>Event</EventCell>
        <DispositionCell>Disp</DispositionCell>
        <MessageCell>Message</MessageCell>
      </HeaderRow>
    );
  }
  return (
    <HeaderRow>
      <LineNumber>#</LineNumber>
      <RawTextCell>Log Line</RawTextCell>
    </HeaderRow>
  );
}

export function LogRow({
  line,
  isSelected,
  onClick,
}: LogRowProps): JSX.Element {
  if (isVxLogLine(line)) {
    return (
      <Row isSelected={isSelected} onClick={(e) => onClick(line.lineNumber, e)}>
        <LineNumber>{line.lineNumber}</LineNumber>
        <TimeCell>{formatTimestamp(line.timeLogWritten)}</TimeCell>
        <SourceCell>{line.source}</SourceCell>
        <EventCell>{line.eventId}</EventCell>
        <DispositionCell disposition={line.disposition}>
          {line.disposition}
        </DispositionCell>
        <MessageCell>{line.message}</MessageCell>
      </Row>
    );
  }

  return (
    <Row isSelected={isSelected} onClick={(e) => onClick(line.lineNumber, e)}>
      <LineNumber>{line.lineNumber}</LineNumber>
      <RawTextCell>{line.text}</RawTextCell>
    </Row>
  );
}
