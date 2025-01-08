import React, { forwardRef, Ref } from 'react';
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

// eslint-disable-next-line react/display-name
export const ScanPanelRow = forwardRef(
  (
    { children, onSelect = () => {}, selectable, selected }: ScanPanelRowProps,
    ref: Ref<HTMLButtonElement>
  ): JSX.Element =>
    selected ? (
      <RowDisplay>{children}</RowDisplay>
    ) : (
      <RowButton onClick={onSelect} disabled={!selectable} ref={ref}>
        {children}
      </RowButton>
    )
);
