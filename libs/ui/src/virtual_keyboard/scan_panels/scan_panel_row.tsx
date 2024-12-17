import React from 'react';
import styled from 'styled-components';

const RowButton = styled.button`
  margin-bottom: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
  flex-basis: 100%;
`;

const RowDisplay = styled.div`
  display: flex;
  gap: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
  margin-bottom: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
  flex-grow: 1;
`;

interface ScanPanelRowProps {
  children?: React.ReactNode;
  onSelect?: () => void;
  selectable: boolean;
  selected: boolean;
}

export function ScanPanelRow({
  children,
  onSelect = () => {},
  selectable,
  selected,
}: ScanPanelRowProps): JSX.Element {
  return selected ? (
    <RowDisplay>{children}</RowDisplay>
  ) : (
    <RowButton onClick={onSelect} disabled={!selectable}>
      {children}
    </RowButton>
  );
}
