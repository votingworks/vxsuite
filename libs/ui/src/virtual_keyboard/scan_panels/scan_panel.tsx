import React, { forwardRef, Ref } from 'react';
import styled from 'styled-components';
import { gapStyles } from '../../button';
import { TextOnly } from '../../ui_strings';
import { getBorderWidthRem, Key } from '../common';
import { KeyGroupAudioLabel } from './key_group_audio_label';

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
  keys: Key[];
  numKeys: number;
  onSelect: () => void;
  renderAs: ScanPanelRenderOption;
}

// eslint-disable-next-line react/display-name
export const ScanPanel = forwardRef(
  (
    { children, keys, renderAs, numKeys, onSelect }: ScanPanelProps,
    ref: Ref<HTMLButtonElement>
  ): JSX.Element => {
    switch (renderAs) {
      case 'button-enabled':
        return (
          <ScanPanelButton numKeys={numKeys} onClick={onSelect} ref={ref}>
            <TextOnly>{children}</TextOnly>
            <KeyGroupAudioLabel keys={keys} />
          </ScanPanelButton>
        );
      case 'button-disabled':
        return (
          <ScanPanelButton numKeys={numKeys} onClick={onSelect} disabled>
            <TextOnly>{children}</TextOnly>
            <KeyGroupAudioLabel keys={keys} />
          </ScanPanelButton>
        );
      case 'container':
      default:
        return (
          <ScanPanelDisplay numKeys={numKeys}>{children}</ScanPanelDisplay>
        );
    }
  }
);
