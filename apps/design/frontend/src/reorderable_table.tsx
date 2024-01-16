import React from 'react';
import styled, { useTheme } from 'styled-components';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Icons, TD, TH, Table } from '@votingworks/ui';

const ReorderableTableContext = React.createContext<{
  disabled?: boolean;
}>({});

const DragHandle = styled.div<{ isDragging?: boolean }>`
  cursor: ${(p) => (p.isDragging ? 'grabbing' : 'grab')};
  padding: 0.7rem 0;
`;

export function ReorderableTableRow({
  rowId,
  children,
}: {
  rowId: string;
  children: React.ReactNode;
}): JSX.Element {
  const {
    attributes,
    listeners,
    isDragging,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: rowId });
  const { disabled } = React.useContext(ReorderableTableContext);
  const theme = useTheme();

  return (
    <tr
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition: transition ?? undefined,
        background: isDragging ? theme.colors.primaryContainer : undefined,
      }}
      ref={setNodeRef}
    >
      {!disabled && (
        <TD>
          <DragHandle {...attributes} {...listeners} isDragging={isDragging}>
            <Icons.Grip />
          </DragHandle>
        </TD>
      )}
      {children}
    </tr>
  );
}

export function ReorderableTableHeaderRow({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const { disabled } = React.useContext(ReorderableTableContext);
  return (
    <tr>
      {!disabled && <TH />}
      {children}
    </tr>
  );
}

export function ReorderableTable({
  rowIds,
  children,
  onReorder,
  disabled,
}: {
  rowIds: string[];
  children: React.ReactNode;
  onReorder: (fromId: string, toId: string) => void;
  disabled?: boolean;
}): JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <ReorderableTableContext.Provider value={{ disabled }}>
      <DndContext
        sensors={sensors}
        onDragEnd={(e: DragEndEvent) => {
          if (e.over) {
            onReorder(e.active.id as string, e.over.id as string);
          }
        }}
        modifiers={[restrictToVerticalAxis]}
        accessibility={{ container: document.body }}
      >
        <SortableContext
          items={rowIds.map((id) => ({ id }))}
          strategy={verticalListSortingStrategy}
        >
          <Table>{children}</Table>
        </SortableContext>
      </DndContext>
    </ReorderableTableContext.Provider>
  );
}
