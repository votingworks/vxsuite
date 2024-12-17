import React from 'react';
import styled from 'styled-components';
import { gapStyles } from '../../button';
import { getBorderWidthRem } from '../common';

interface StyledComponentProps {
  numKeys: number;
}
const ScanPanelButton = styled.button<StyledComponentProps>`
  flex-grow: ${(p) => p.numKeys};
  border-width: ${getBorderWidthRem}rem;
`;

const ScanPanelDisplay = styled.div<StyledComponentProps>`
  display: flex;
  flex-grow: ${(p) => p.numKeys};
  justify-content: space-between;
  gap: ${(p) => gapStyles[p.theme.sizeMode]};
`;

export type ScanPanelRenderOption =
  | 'button-enabled'
  | 'button-disabled'
  | 'container';

interface ScanPanelProps {
  children?: React.ReactNode;
  numKeys: number;
  onSelect: () => void;
  renderAs: ScanPanelRenderOption;
}

export function ScanPanel({
  children,
  renderAs,
  numKeys,
  onSelect,
}: ScanPanelProps): JSX.Element {
  switch (renderAs) {
    case 'button-enabled':
      return (
        <ScanPanelButton numKeys={numKeys} onClick={onSelect}>
          {children}
        </ScanPanelButton>
      );
    case 'button-disabled':
      return (
        <ScanPanelButton numKeys={numKeys} onClick={onSelect} disabled>
          {children}
        </ScanPanelButton>
      );
    case 'container':
    default:
      return <ScanPanelDisplay numKeys={numKeys}>{children}</ScanPanelDisplay>;
  }
}
