import styled from 'styled-components';
import { Scrollable, ScrollShadows } from '../config/types';

export const ContentHeader = styled.div`
  margin: 0 auto;
  width: 100%;
  padding: 0.125rem 30px 0.125rem;
`;
export const ContestFooter = styled.div`
  margin: 0 auto;
  width: 100%;
  padding: 30px 20px 0;
`;
export const DistrictName = styled.div`
  text-transform: uppercase;
  font-size: 0.85rem;
  font-weight: 600;
`;
export const VariableContentContainer = styled.div<ScrollShadows>`
  display: flex;
  position: relative;
  overflow: auto;
  &::before,
  &::after {
    position: absolute;
    z-index: 1;
    width: 100%;
    height: 0.25rem;
    content: '';
    transition: opacity 0.25s ease;
  }
  &::before {
    top: 0;
    opacity: ${({ showTopShadow }) =>
      showTopShadow ? /* istanbul ignore next: Tested by Cypress */ 1 : 0};
    background: linear-gradient(
      to bottom,
      rgb(177, 186, 190) 0%,
      transparent 100%
    );
  }
  &::after {
    bottom: 0;
    opacity: ${({ showBottomShadow }) =>
      showBottomShadow ? /* istanbul ignore next: Tested by Cypress */ 1 : 0};
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgb(177, 186, 190) 100%
    );
  }
`;
export const ScrollControls = styled.div`
  z-index: 2;
  & > button {
    position: absolute;
    right: 0.25rem;
    transform: opacity 1s linear;
    visibility: visible;
    opacity: 1;
    outline: none;
    box-shadow: 0 0 10px 3px rgba(0, 0, 0, 0.3);
    /* width: 8rem; */
    height: 3rem;
    /* padding: 0; */
    /* font-weight: 700; */
    transition: visibility 0s linear 0s, opacity 500ms;
    &[disabled] {
      visibility: hidden;
      opacity: 0;
      transition: visibility 0s linear 500ms, opacity 500ms;
      pointer-events: none;
    }
    & > span {
      position: relative;
      pointer-events: none;
    }
    &::before {
      position: absolute;
      left: 50%;
      margin-left: -1rem;
      width: 2rem;
      height: 2rem;
      content: '';
    }
    &:first-child {
      top: 0;
      border-radius: 0 0 5rem 5rem;
      & > span {
        top: -0.5rem;
      }
      /* &::before {
        bottom: 0.75rem;
        background: url('/images/arrow-up.svg') no-repeat;
      } */
    }
    &:last-child {
      bottom: 0;
      border-radius: 3rem 3rem 0 0;
      & > span {
        top: 0.5rem;
      }
      /* &::before {
        top: 0.75rem;
        background: url('/images/arrow-down.svg') no-repeat;
      } */
    }
  }
`;
export const ScrollContainer = styled.div`
  flex: 1;
  overflow: auto;
`;
export const ScrollableContentWrapper = styled.div<Scrollable>`
  margin: 0 auto;
  width: 100%;
  padding: 0.25rem 20px 0;
  padding-right: ${({ isScrollable }) =>
    isScrollable
      ? /* istanbul ignore next: Tested by Cypress */ '11rem'
      : undefined};
`;
export const ContestDescription = styled.div`
  padding: 0 10px;
`;
export const ChoicesGrid = styled.div.attrs({
  'aria-multiselectable': true,
  role: 'listbox',
})`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 0.75rem;
`;
