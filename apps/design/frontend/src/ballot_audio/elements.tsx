import { Button, DesktopPalette, ButtonProps, H5 } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

export const AudioControls = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
`;

export const AudioPlayer = styled.audio`
  border-radius: 100vh;
`;

export const AudioRefreshButton = styled(Button)`
  background: none;
  border-radius: 100vh;
  border: 0;
  color: ${DesktopPalette.Purple70};
  cursor: pointer;
  margin: 0;
  outline-offset: 2px;
  padding: 1.25rem;
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;

  span {
    align-items: center;
    display: flex;
    line-height: 1;
  }

  :focus,
  :hover {
    background: ${DesktopPalette.Purple10} !important;
    color: ${DesktopPalette.Purple80};
    font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  }

  :active {
    background: ${DesktopPalette.Purple20} !important;
    outline-offset: 0;
  }

  &[disabled] {
    background: none;
    color: #999;

    :active,
    :focus,
    :hover {
      background: none;
      color: #999;
    }
  }
` as unknown as new <T>() => React.Component<ButtonProps<T>>;

export const SubHeading = styled(H5)`
  color: #666;
  font-size: 0.8rem;
`;
