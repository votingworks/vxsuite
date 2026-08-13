import React from 'react';
import styled from 'styled-components';
import { H3 } from '@votingworks/ui';

export const CardListItemTitle = styled(H3)`
  margin: 0;
`;

export const CardListItemSubtitle = 'div';

const StyledCardListItem = styled.div`
  display: flex;
  gap: 2rem;
  align-items: stretch;
  padding: 1rem;
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background-color: ${(p) => p.theme.colors.containerLow};

    ${CardListItemTitle} {
      text-decoration: underline;
    }
  }
`;

export interface CardListItemProps {
  onPress: () => void;
  leadingSlot?: React.ReactNode;
  contentSlot?: React.ReactNode;
  trailingSlot?: React.ReactNode;
}

/**
 * A row in a CardList. Has three fillable slots: leading, content, and
 * trailing.
 */
export function CardListItem({
  onPress,
  leadingSlot,
  contentSlot,
  trailingSlot,
}: CardListItemProps): JSX.Element {
  function onClick(event: React.MouseEvent) {
    // Ignore clicks bubbling up through the React tree from children rendered
    // in portals (e.g. modals), which happen outside the item in the DOM
    if (!event.currentTarget.contains(event.target as Node)) {
      return;
    }
    onPress();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Ignore key presses bubbling up from children
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      // Prevent Space from scrolling the page
      event.preventDefault();
      onPress();
    }
  }

  return (
    <StyledCardListItem
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {leadingSlot}
      {contentSlot}
      {trailingSlot}
    </StyledCardListItem>
  );
}

/**
 * List of CardListItems.
 */
export const CardList = styled.div`
  display: flex;
  flex-direction: column;

  > *:not(:first-child) {
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  > *:not(:last-child) {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
`;
