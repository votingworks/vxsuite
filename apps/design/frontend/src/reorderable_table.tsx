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
import { Icons, TD, Table } from '@votingworks/ui';
import { assert, assertDefined } from '@votingworks/basics';

export const ReorderableTr = styled.tr<{ isDragging?: boolean }>`
  background: ${(p) =>
    p.isDragging ? p.theme.colors.primaryContainer : undefined};
`;

export const DragHandle = styled.div<{ isDragging?: boolean }>`
  cursor: ${(p) => (p.isDragging ? 'grabbing' : 'grab')};
  padding: 0.7rem 0;
`;

export function ReorderableTableRowWrapper({
  element,
}: {
  element: React.ReactElement;
}): JSX.Element {
  const {
    attributes,
    listeners,
    isDragging,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: assertDefined(element.key) });
  const theme = useTheme();

  const { children, style, ...rest } = element.props;
  return (
    <tr
      {...rest}
      style={{
        ...(style ?? {}),
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition: transition ?? undefined,
        background: isDragging ? theme.colors.primaryContainer : undefined,
      }}
      ref={setNodeRef}
    >
      <TD>
        <DragHandle {...attributes} {...listeners} isDragging={isDragging}>
          <Icons.Grip />
        </DragHandle>
      </TD>
      {children}
    </tr>
  );
}

export function ReorderableTable({
  children,
  onReorder,
  disabled,
}: {
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

  let [thead, tbody] = React.Children.toArray(children) as Array<
    React.ReactHTMLElement<HTMLElement>
  >;
  assert(React.isValidElement(thead) && React.isValidElement(tbody));
  thead = disabled
    ? thead
    : React.cloneElement(
        thead,
        thead.props,
        React.Children.map(
          thead.props.children,
          (tr) =>
            React.isValidElement(tr) &&
            React.cloneElement(tr, assertDefined(tr).props, [
              <th key="drag-handle-header" />,
              ...React.Children.toArray(tr.props.children),
            ])
        )
      );

  const items =
    React.Children.map(
      tbody.props.children,
      (child) => React.isValidElement(child) && { id: assertDefined(child.key) }
    ) ?? [];
  tbody = disabled
    ? tbody
    : React.cloneElement(
        tbody,
        tbody.props,
        React.Children.map(tbody.props.children, (child) => {
          assert(React.isValidElement(child));
          return <ReorderableTableRowWrapper element={child} />;
        })
      );

  return (
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
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <Table>
          {thead}
          {tbody}
        </Table>
      </SortableContext>
    </DndContext>
  );
}
