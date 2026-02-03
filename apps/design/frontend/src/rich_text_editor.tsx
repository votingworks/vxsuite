import {
  useEditor,
  EditorContent,
  Editor,
  useEditorState,
} from '@tiptap/react';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Text from '@tiptap/extension-text';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import HardBreak from '@tiptap/extension-hard-break';
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import {
  Table,
  TableCell,
  TableRow,
  TableHeader,
} from '@tiptap/extension-table';
import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import { Slice } from '@tiptap/pm/model';
import {
  Button,
  ButtonProps,
  Callout,
  Icons,
  richTextStyles,
} from '@votingworks/ui';
import styled from 'styled-components';
import React, { useState } from 'react';
import { Buffer } from 'node:buffer';
import { ImageInputButton } from './image_input';
import { NormalizeParams } from './image_normalization';

const ControlGroup = styled.div`
  display: flex;
  gap: 0.125rem;
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;

  > button,
  > label /* Image input button is rendered as a label */ {
    border: 0;
  }
`;

export const StyledRichTextEditor = styled.div`
  --rich-text-editor-padding: 0.5rem;

  cursor: text;
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  background: ${(p) => p.theme.colors.containerLow};
  padding: var(--rich-text-editor-padding);
  line-height: ${(p) => p.theme.sizes.lineHeight};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  max-width: calc(75ch + (2 * var(--rich-text-editor-padding)));

  &:focus-within {
    background: none;
    outline: var(--focus-outline);
  }

  .tiptap {
    outline: none;
    padding: 1rem 0 0.5rem;

    /* Ensure we can see the cursor in an empty table cell by giving it a min width */
    table {
      td,
      th {
        min-width: 1.5rem;
      }
    }

    ${richTextStyles}
  }

  &[data-disabled='true'] {
    border-style: dashed;
    cursor: not-allowed;

    ${ControlGroup} {
      border-style: dashed;
    }
  }

  overflow: auto;
`;

const StyledToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;

  button,
  label {
    padding: 0.25rem 0.5rem;
    gap: 0.25rem;
  }
`;

const ToolbarErrorCallout = styled(Callout)`
  > div {
    padding: 0.25rem 0.5rem;
    align-items: center;
  }
`;

function ControlButton({
  isActive,
  ...props
}: { isActive?: boolean } & ButtonProps) {
  return (
    <Button
      color={isActive ? 'primary' : 'neutral'}
      fill={isActive ? 'tinted' : 'transparent'}
      {...props}
    />
  );
}

const PDF_PIXELS_PER_INCH = 96;
const LETTER_PAGE_HEIGHT_INCHES = 11;
const LETTER_PAGE_WIDTH_INCHES = 8.5;

/**
 * These assume a worst-case of ballots with full-width contest boxes and images
 * that take up all the available width.
 *
 * The subtracted margins are inexact and can be tweaked if needed. Last tested
 * with "full-height" and "full-width" images rendering without error on
 * letter-sized pages. The height margin accounts for the worst-case of a
 * header, footer, and instructions on page 1.
 *
 * [TODO] The max width should really be the VxMark screen size (1080px), since
 * that's the largest render surface for these images, but we need to add image
 * scaling to the ballot renderer first, to limit them to the bounds of the
 * contest box.
 */
const NORMALIZE_PARAMS: Readonly<NormalizeParams> = {
  maxHeightPx: (LETTER_PAGE_HEIGHT_INCHES - 5) * PDF_PIXELS_PER_INCH,
  maxWidthPx: (LETTER_PAGE_WIDTH_INCHES - 2) * PDF_PIXELS_PER_INCH,
};

function Toolbar({ disabled, editor }: { disabled?: boolean; editor: Editor }) {
  const [imageError, setImageError] = useState<Error>();
  const isActive = useEditorState({
    editor,
    selector: (state) => ({
      bold: state.editor.isActive('bold'),
      italic: state.editor.isActive('italic'),
      underline: state.editor.isActive('underline'),
      strike: state.editor.isActive('strike'),
      bulletList: state.editor.isActive('bulletList'),
      orderedList: state.editor.isActive('orderedList'),
      table: state.editor.isActive('table'),
    }),
  });

  return (
    <StyledToolbar>
      <ControlGroup>
        <ControlButton
          disabled={disabled}
          icon="Bold"
          aria-label="Bold"
          isActive={isActive.bold}
          onPress={() => editor.chain().focus().toggleBold().run()}
        />
        <ControlButton
          disabled={disabled}
          icon="Italic"
          aria-label="Italic"
          isActive={isActive.italic}
          onPress={() => editor.chain().focus().toggleItalic().run()}
        />
        <ControlButton
          disabled={disabled}
          icon="Underline"
          aria-label="Underline"
          isActive={isActive.underline}
          onPress={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ControlButton
          disabled={disabled}
          icon="Strikethrough"
          aria-label="Strikethrough"
          isActive={isActive.strike}
          onPress={() => editor.chain().focus().toggleStrike().run()}
        />
      </ControlGroup>
      <ControlGroup>
        <ControlButton
          disabled={disabled}
          icon="ListUnordered"
          aria-label="Bullet List"
          isActive={isActive.bulletList}
          onPress={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ControlButton
          disabled={disabled}
          icon="ListOrdered"
          aria-label="Number List"
          isActive={isActive.orderedList}
          onPress={() => editor.chain().focus().toggleOrderedList().run()}
        />
      </ControlGroup>
      <ControlGroup>
        <ImageInputButton
          buttonProps={{
            fill: 'transparent',
          }}
          disabled={disabled}
          normalizeParams={NORMALIZE_PARAMS}
          onChange={(svgImage) => {
            setImageError(undefined);
            editor
              .chain()
              .focus()
              .setImage({
                src: `data:image/svg+xml;base64,${Buffer.from(
                  svgImage
                ).toString('base64')}`,
              })
              .run();
          }}
          onError={(error) => setImageError(error)}
          aria-label="Insert Image"
        >
          <Icons.Image />
        </ImageInputButton>
      </ControlGroup>

      <ControlGroup>
        <ControlButton
          disabled={disabled}
          icon="Table"
          aria-label="Table"
          isActive={isActive.table}
          onPress={() =>
            isActive.table
              ? editor.chain().focus().deleteTable().run()
              : editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
          }
        />
        {isActive.table && (
          <React.Fragment>
            <ControlButton
              disabled={disabled}
              icon={
                <React.Fragment>
                  <Icons.Add />
                  <Icons.LinesHorizontal />
                </React.Fragment>
              }
              aria-label="Add Row"
              onPress={() => editor.chain().focus().addRowAfter().run()}
            />
            <ControlButton
              disabled={disabled}
              icon={
                <React.Fragment>
                  <Icons.Delete />
                  <Icons.LinesHorizontal />
                </React.Fragment>
              }
              aria-label="Remove Row"
              onPress={() => editor.chain().focus().deleteRow().run()}
            />
            <ControlButton
              disabled={disabled}
              icon={
                <React.Fragment>
                  <Icons.Add />
                  <Icons.LinesVertical />
                </React.Fragment>
              }
              aria-label="Add Column"
              onPress={() => editor.chain().focus().addColumnAfter().run()}
            />
            <ControlButton
              disabled={disabled}
              icon={
                <React.Fragment>
                  <Icons.Delete />
                  <Icons.LinesVertical />
                </React.Fragment>
              }
              aria-label="Remove Column"
              onPress={() => editor.chain().focus().deleteColumn().run()}
            />
          </React.Fragment>
        )}
      </ControlGroup>
      {imageError && (
        <ToolbarErrorCallout color="warning" icon="Warning">
          {imageError.message}
        </ToolbarErrorCallout>
      )}
    </StyledToolbar>
  );
}

/**
 * If a user pastes a table with a single cell, they probably just wanted to
 * paste the cell contents, so we unwrap the table, table row, and table cell.
 */
function unwrapSingleCellTablesOnPaste(slice: Slice): Slice {
  const fragment = slice.content;
  if (
    fragment.childCount === 1 &&
    fragment.child(0).type.name === 'table' &&
    fragment.child(0).content.childCount === 1 &&
    fragment.child(0).content.child(0).type.name === 'tableRow' &&
    fragment.child(0).content.child(0).content.childCount === 1 &&
    fragment.child(0).content.child(0).content.child(0).type.name ===
      'tableCell'
  ) {
    return new Slice(
      fragment.replaceChild(
        0,
        fragment.child(0).content.child(0).content.child(0).content.child(0)
      ),
      slice.openStart,
      slice.openEnd
    );
  }
  return slice;
}

// Find the last text node in a given root node
function findLastTextNode(root: Node): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  while (walker.nextNode()) last = walker.currentNode as Text;
  return last;
}

// Remove trailing NBSPs and trailing whitespace, if there is at least one nbsp (unicode U+00A0)
function stripTrailingNbsp(text: string): string {
  return text.replace(/[\u00A0\s]+$/, '');
}

// HTML_BLOCKS includes the HTML elements that most commonly have unintended trailing
// non-breaking spaces when pasting content from external sources
const HTML_BLOCKS = ['p', 'li', 'td', 'th'] as const;
export function sanitizeTrailingNbspOnPaste(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll(HTML_BLOCKS.join(',')).forEach((block) => {
    const lastText = findLastTextNode(block);
    if (lastText?.nodeValue) {
      lastText.nodeValue = stripTrailingNbsp(lastText.nodeValue);
    }
  });

  return doc.body.innerHTML;
}

interface RichTextEditorProps {
  disabled?: boolean;
  initialHtmlContent: string;
  onChange: (htmlContent: string) => void;
  className?: string;
}

export function RichTextEditor({
  disabled,
  initialHtmlContent,
  onChange,
  className,
}: RichTextEditorProps): JSX.Element {
  const editor = useEditor({
    editable: !disabled,
    extensions: [
      Document,
      Text,
      Paragraph,
      HardBreak,
      Bold,
      Italic,
      Underline,
      Strike,
      BulletList,
      OrderedList,
      ListItem,
      Image.configure({ allowBase64: true }),
      Table.configure({
        // The default minWidth adds style to the HTML output, which we don't
        // want. We add some display styles in our own CSS to give a minWidth,
        // which is needed to be able to see the cursor inside an empty table
        // cell.
        cellMinWidth: 0,
      }),
      TableCell,
      TableRow,
      TableHeader,
      Dropcursor,
      Gapcursor,
      UndoRedo,
    ],
    editorProps: {
      transformPasted: unwrapSingleCellTablesOnPaste,
      // eslint-disable-next-line vx/gts-identifiers
      transformPastedHTML: sanitizeTrailingNbspOnPaste,
    },
    content: initialHtmlContent,
    onUpdate: (update) => {
      onChange(update.editor.getHTML());
    },
  });
  return (
    <StyledRichTextEditor
      data-testid="rich-text-editor"
      data-disabled={disabled}
      onClick={() => editor?.chain().focus().run()}
      className={className}
    >
      {editor && <Toolbar disabled={disabled} editor={editor} />}
      <EditorContent editor={editor} />
    </StyledRichTextEditor>
  );
}
