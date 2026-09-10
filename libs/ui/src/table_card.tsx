import React from 'react';
import { cssThemedScrollbars, SCROLLBAR_THICKNESS_REM } from './scrollbars.js';
import { styled } from './styled.js';
import { Table } from './table.js';

const HEADER_LINE_HEIGHT_REM = 1;
const HEADER_PADDING_Y_REM = 0.5;
const HEADER_CONTENT_REM = HEADER_LINE_HEIGHT_REM + 2 * HEADER_PADDING_Y_REM;
const BORDER_RADIUS_REM = 0.5;

const Card = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: ${(p) =>
    `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
  border-radius: ${BORDER_RADIUS_REM}rem;
  overflow: hidden;

  &::before,
  &::after {
    content: '';
    position: absolute;
    right: 0;
    width: ${SCROLLBAR_THICKNESS_REM}rem;
    pointer-events: none;
  }

  &::before {
    top: 0;
    height: ${HEADER_CONTENT_REM}rem;
    background-color: ${(p) => p.theme.colors.container};
  }

  &::after {
    top: ${HEADER_CONTENT_REM}rem;
    height: ${(p) => p.theme.sizes.bordersRem.thin}rem;
    background-color: ${(p) => p.theme.colors.outline};
  }
`;

const Scroller = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;

  ${cssThemedScrollbars}

  ::-webkit-scrollbar-track {
    margin-top: calc(
      ${HEADER_CONTENT_REM}rem + ${(p) => p.theme.sizes.bordersRem.thin}rem
    );
    margin-bottom: ${BORDER_RADIUS_REM / 2}rem;
  }
`;

const StyledTable = styled(Table)`
  border-collapse: separate;
  border-spacing: 0;

  td {
    padding: 0.75rem 1rem;
    border-bottom: none;
  }

  th {
    padding: ${HEADER_PADDING_Y_REM}rem 1rem;
    line-height: ${HEADER_LINE_HEIGHT_REM}rem;
    white-space: nowrap;
    background-color: ${(p) => p.theme.colors.container};
    border-top: none;
    border-bottom: ${(p) =>
      `${p.theme.sizes.bordersRem.thin}rem solid ${p.theme.colors.outline}`};
    position: sticky;
    top: 0;
    z-index: 1;
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  }

  tr:nth-child(even) {
    background-color: ${(p) => p.theme.colors.containerLow};
  }
`;

export interface TableCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function TableCard({
  children,
  className,
  style,
}: TableCardProps): JSX.Element {
  return (
    <Card className={className} style={style}>
      <Scroller>
        <StyledTable>{children}</StyledTable>
      </Scroller>
    </Card>
  );
}
