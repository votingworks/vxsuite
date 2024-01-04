import { assert } from '@votingworks/basics';
import React, { useState } from 'react';
import styled from 'styled-components';

interface ReorderableListProps {
  children: React.ReactNode;
  onReorder: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
}

interface ReorderableItemProps {
  isBeingReordered?: boolean;
  isBeingHoveredOver?: boolean;
}

interface ReorderingState {
  fromIndex: number;
  toIndex: number;
}

export function ReorderableList({
  children,
  onReorder,
  disabled,
}: ReorderableListProps): JSX.Element {
  const [reorderingState, setReorderingState] = useState<
    ReorderingState | undefined
  >();

  if (disabled) {
    return <React.Fragment>{children}</React.Fragment>;
  }

  return (
    <React.Fragment>
      {React.Children.map(children, (child, index) => {
        return React.cloneElement(child as React.ReactElement, {
          draggable: true,
          isBeingReordered: reorderingState?.fromIndex === index,
          isBeingHoveredOver: reorderingState?.toIndex === index,
          onDragStart(e: React.DragEvent) {
            setReorderingState({ fromIndex: index, toIndex: index });
            e.dataTransfer.setData('text/plain', '');
            e.dataTransfer.dropEffect = 'move';
          },
          onDragEnter(e: React.DragEvent) {
            assert(reorderingState);
            e.dataTransfer.effectAllowed = 'move';
            e.preventDefault();
            setReorderingState({ ...reorderingState, toIndex: index });
          },
          onDragOver(e: React.DragEvent) {
            e.preventDefault();
          },
          onDragEnd() {
            setReorderingState(undefined);
          },
          onDrop() {
            assert(reorderingState);
            onReorder(reorderingState.fromIndex, reorderingState.toIndex);
          },
        });
      })}
    </React.Fragment>
  );
}

export const ReorderableTr = styled.tr<ReorderableItemProps>`
  user-select: none;
  cursor: ${(p) => p.draggable && (p.isBeingReordered ? 'grabbing' : 'grab')};
  background-color: ${(p) => p.theme.colors.background};
  opacity: ${(p) => (p.isBeingReordered ? 0.4 : undefined)};
  td {
    border-bottom: ${(p) =>
      p.isBeingHoveredOver ? `2px solid ${p.theme.colors.primary}` : undefined};
  }
  &:hover {
    background-color: ${(p) => p.draggable && p.theme.colors.primaryContainer};
  }
`;
