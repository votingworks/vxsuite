import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '../test/react_testing_library';
import { RichTextEditor } from './rich_text_editor';

// userEvent.type only works when the editor is empty for some reason - this
// appends to existing content
function type(editor: HTMLElement, text: string) {
  fireEvent.change(editor.querySelector('.tiptap')!, {
    target: {
      textContent: editor.querySelector('.tiptap p')!.textContent + text,
    },
  });
}

test('renders initial content', async () => {
  render(
    <RichTextEditor initialHtmlContent="<p>Content</p>" onChange={jest.fn()} />
  );
  await screen.findByText('Content');
});

test('calls onChange when content changes', async () => {
  const onChange = jest.fn();
  render(<RichTextEditor initialHtmlContent="" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  expect(editor).toHaveTextContent('');

  userEvent.type(editor.querySelector('.tiptap')!, 'Content');
  await screen.findByText('Content');
  expect(onChange).toHaveBeenCalledTimes('Content'.length);
  expect(onChange).toHaveBeenLastCalledWith('<p>Content</p>');
});

test('bold formatting', async () => {
  const onChange = jest.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  await screen.findByText('Content');

  const boldButton = screen.getByRole('button', { name: 'Bold' });
  userEvent.click(boldButton);
  type(editor, ' bold');
  await screen.findByText('Content bold');
  expect(onChange).toHaveBeenLastCalledWith(
    '<p>Content<strong> bold</strong></p>'
  );
});

test('italic formatting', async () => {
  const onChange = jest.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  await screen.findByText('Content');

  const italicButton = screen.getByRole('button', { name: 'Italic' });
  userEvent.click(italicButton);
  type(editor, ' italic');
  await screen.findByText('Content italic');
  expect(onChange).toHaveBeenLastCalledWith('<p>Content<em> italic</em></p>');
});

test('underline formatting', async () => {
  const onChange = jest.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  await screen.findByText('Content');

  const underlineButton = screen.getByRole('button', { name: 'Underline' });
  userEvent.click(underlineButton);
  type(editor, ' underline');
  await screen.findByText('Content underline');
  expect(onChange).toHaveBeenLastCalledWith('<p>Content<u> underline</u></p>');
});

test('strikethrough formatting', async () => {
  const onChange = jest.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  await screen.findByText('Content');

  const strikethroughButton = screen.getByRole('button', {
    name: 'Strikethrough',
  });
  userEvent.click(strikethroughButton);
  type(editor, ' strikethrough');
  await screen.findByText('Content strikethrough');
  expect(onChange).toHaveBeenLastCalledWith(
    '<p>Content<s> strikethrough</s></p>'
  );
});

test('bullet list formatting', async () => {
  const onChange = jest.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);
  await screen.findByText('Content');

  const bulletListButton = screen.getByRole('button', { name: 'Bullet List' });
  userEvent.click(bulletListButton);
  const item = await screen.findByRole('listitem');
  expect(item).toHaveTextContent('Content');
  expect(onChange).toHaveBeenLastCalledWith('<ul><li><p>Content</p></li></ul>');
});

test('number list formatting', async () => {
  const onChange = jest.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);
  await screen.findByText('Content');

  const numberListButton = screen.getByRole('button', { name: 'Number List' });
  userEvent.click(numberListButton);
  const item = await screen.findByRole('listitem');
  expect(item).toHaveTextContent('Content');
  expect(onChange).toHaveBeenLastCalledWith('<ol><li><p>Content</p></li></ol>');
});
