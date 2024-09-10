import { useEditor, EditorContent, Editor } from '@tiptap/react';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Text from '@tiptap/extension-text';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import HardBreak from '@tiptap/extension-hard-break';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { Button, ButtonProps } from '@votingworks/ui';
import styled from 'styled-components';

const StyledEditor = styled.div`
  cursor: text;
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  background: ${(p) => p.theme.colors.containerLow};
  padding: 0.5rem;
  line-height: ${(p) => p.theme.sizes.lineHeight};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;

  &:focus-within {
    background: none;
    outline: var(--focus-outline);
  }

  .tiptap {
    outline: none;
    padding: 1rem 0 0.5rem;

    > :first-child {
      margin-top: 0;
    }

    > :last-child {
      margin-bottom: 0;
    }

    li p {
      margin: 0.25em 0;
    }
  }
`;

const StyledToolbar = styled.div`
  display: flex;
  gap: 0.25rem;

  button {
    padding: 0.25rem 0.5rem;
  }
`;

const ControlGroup = styled.div`
  display: flex;
  gap: 0.125rem;
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
`;

function ControlButton({
  isActive,
  ...props
}: { isActive: boolean } & ButtonProps) {
  return (
    <Button
      color={isActive ? 'primary' : 'neutral'}
      fill={isActive ? 'tinted' : 'transparent'}
      {...props}
    />
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <StyledToolbar>
      <ControlGroup>
        <ControlButton
          icon="Bold"
          aria-label="Bold"
          isActive={editor.isActive('bold')}
          onPress={() => editor.chain().focus().toggleBold().run()}
        />
        <ControlButton
          icon="Italic"
          aria-label="Italic"
          isActive={editor.isActive('italic')}
          onPress={() => editor.chain().focus().toggleItalic().run()}
        />
        <ControlButton
          icon="Underline"
          aria-label="Underline"
          isActive={editor.isActive('underline')}
          onPress={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ControlButton
          icon="Strikethrough"
          aria-label="Strikethrough"
          isActive={editor.isActive('strike')}
          onPress={() => editor.chain().focus().toggleStrike().run()}
        />
      </ControlGroup>
      <ControlGroup>
        <ControlButton
          icon="ListUnordered"
          aria-label="Bullet List"
          isActive={editor.isActive('bulletList')}
          onPress={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ControlButton
          icon="ListOrdered"
          aria-label="Number List"
          isActive={editor.isActive('orderedList')}
          onPress={() => editor.chain().focus().toggleOrderedList().run()}
        />
      </ControlGroup>
    </StyledToolbar>
  );
}

interface RichTextEditorProps {
  initialHtmlContent: string;
  onChange: (htmlContent: string) => void;
}

export function RichTextEditor({
  initialHtmlContent,
  onChange,
}: RichTextEditorProps): JSX.Element {
  const editor = useEditor({
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
    ],
    content: initialHtmlContent,
    onUpdate: (update) => {
      onChange(update.editor.getHTML());
    },
  });
  return (
    <StyledEditor
      data-testid="rich-text-editor"
      onClick={() => editor?.chain().focus().run()}
    >
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </StyledEditor>
  );
}
