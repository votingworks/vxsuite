import {
  Button,
  DesktopPalette,
  ButtonProps,
  H5,
  Caption,
} from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

export const AudioControls = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap-reverse;
  gap: 0.5rem;
  justify-content: space-between;
`;

export const AudioPlayer = styled.audio``;

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

export const Note = styled(Caption)`
  color: #444;
  margin: 0 0 0.5rem 0.1rem;
`;

export const StringPanel = styled.div`
  display: grid;
  gap: 1rem;
  grid-template-rows: minmax(6rem, 12rem) 1fr;
  grid-template-rows: minmax(4rem, min(min-content, 12rem)) 1fr;
  grid-template-rows: min-content 1fr;
  /* gap: 2rem; */
  max-width: 45rem;
  width: 100%;
  height: 100%;
  height: 100%;
  overflow: hidden;

  > :last-child {
    flex-grow: 1;
  }
`;

export const SubHeading = styled(H5)`
  color: #666;
  font-size: 0.8rem;
`;
