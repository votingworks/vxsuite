import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Buffer } from 'node:buffer';
import { fireEvent, render, screen } from '../test/react_testing_library';
import { RichTextEditor } from './rich_text_editor';

// We mostly test that the buttons in the toolbar work as expected and that
// `onChange` works. We rely on tiptap working correctly for the actual text
// editing. Eventually, we may want to add some Playwright tests to test the
// text editing in a more robust way.
// https://github.com/votingworks/vxsuite/issues/5374

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
    <RichTextEditor initialHtmlContent="<p>Content</p>" onChange={vi.fn()} />
  );
  await screen.findByText('Content');
});

test('calls onChange when content changes', async () => {
  const onChange = vi.fn();
  render(<RichTextEditor initialHtmlContent="" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  expect(editor).toHaveTextContent('');

  userEvent.type(editor.querySelector('.tiptap')!, 'Content');
  await screen.findByText('Content');
  expect(onChange).toHaveBeenCalledTimes('Content'.length);
  expect(onChange).toHaveBeenLastCalledWith('<p>Content</p>');
});

test('bold', async () => {
  const onChange = vi.fn();
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

test('italic', async () => {
  const onChange = vi.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  await screen.findByText('Content');

  const italicButton = screen.getByRole('button', { name: 'Italic' });
  userEvent.click(italicButton);
  type(editor, ' italic');
  await screen.findByText('Content italic');
  expect(onChange).toHaveBeenLastCalledWith('<p>Content<em> italic</em></p>');
});

test('underline', async () => {
  const onChange = vi.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  await screen.findByText('Content');

  const underlineButton = screen.getByRole('button', { name: 'Underline' });
  userEvent.click(underlineButton);
  type(editor, ' underline');
  await screen.findByText('Content underline');
  expect(onChange).toHaveBeenLastCalledWith('<p>Content<u> underline</u></p>');
});

test('strikethrough', async () => {
  const onChange = vi.fn();
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

test('bullet list', async () => {
  const onChange = vi.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);
  await screen.findByText('Content');

  const bulletListButton = screen.getByRole('button', { name: 'Bullet List' });
  userEvent.click(bulletListButton);
  const item = await screen.findByRole('listitem');
  expect(item).toHaveTextContent('Content');
  expect(onChange).toHaveBeenLastCalledWith('<ul><li><p>Content</p></li></ul>');
});

test('number list', async () => {
  const onChange = vi.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);
  await screen.findByText('Content');

  const numberListButton = screen.getByRole('button', { name: 'Number List' });
  userEvent.click(numberListButton);
  const item = await screen.findByRole('listitem');
  expect(item).toHaveTextContent('Content');
  expect(onChange).toHaveBeenLastCalledWith('<ol><li><p>Content</p></li></ol>');
});

test('table', async () => {
  const onChange = vi.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);
  await screen.findByText('Content');

  const tableRowColControlLabels = [
    'Add Row',
    'Remove Row',
    'Add Column',
    'Remove Column',
  ];
  for (const label of tableRowColControlLabels) {
    expect(
      screen.queryByRole('button', { name: label })
    ).not.toBeInTheDocument();
  }

  const tableButton = screen.getByRole('button', { name: 'Table' });
  userEvent.click(tableButton);
  const table = await screen.findByRole('table');
  expect(table).toBeInTheDocument();
  expect(onChange).toHaveBeenLastCalledWith(
    '<table style="min-width: 0px"><colgroup><col><col><col></colgroup><tbody><tr><th colspan="1" rowspan="1"><p></p></th><th colspan="1" rowspan="1"><p></p></th><th colspan="1" rowspan="1"><p></p></th></tr><tr><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr><tr><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr></tbody></table><p>Content</p>'
  );

  userEvent.click(screen.getByRole('button', { name: 'Remove Row' }));
  userEvent.click(screen.getByRole('button', { name: 'Remove Row' }));
  userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
  userEvent.click(screen.getByRole('button', { name: 'Remove Column' }));
  userEvent.click(screen.getByRole('button', { name: 'Remove Column' }));
  userEvent.click(screen.getByRole('button', { name: 'Add Column' }));
  expect(onChange).toHaveBeenLastCalledWith(
    '<table style="min-width: 0px"><colgroup><col><col></colgroup><tbody><tr><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr><tr><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr></tbody></table><p>Content</p>'
  );

  userEvent.click(tableButton);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  for (const label of tableRowColControlLabels) {
    expect(
      screen.queryByRole('button', { name: label })
    ).not.toBeInTheDocument();
  }
  expect(onChange).toHaveBeenLastCalledWith('<p>Content</p>');
});

test('image', async () => {
  const onChange = vi.fn();
  render(<RichTextEditor initialHtmlContent="Content" onChange={onChange} />);
  await screen.findByText('Content');

  const imageContents = '<svg></svg>';
  const imageFile = new File([imageContents], 'image.svg', {
    type: 'image/svg+xml',
  });
  const input = screen.getByLabelText('Insert Image');
  userEvent.upload(input, imageFile);

  await screen.findByRole('img');
  expect(onChange).toHaveBeenLastCalledWith(
    `<p></p><img src="data:image/svg+xml;base64,${Buffer.from(
      imageContents
    ).toString('base64')}"><p>Content</p>`
  );
});

test('unwraps single cell tables on paste', async () => {
  const onChange = vi.fn();
  render(<RichTextEditor initialHtmlContent="" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  fireEvent.paste(editor.querySelector('.tiptap')!, {
    clipboardData: {
      getData: () => '<table><tr><td>Cell contents</td></tr></table>',
    },
  });

  await screen.findByText('Cell contents');
  expect(onChange).toHaveBeenLastCalledWith('<p>Cell contents</p>');
});

test('doesnt unwrap multiple cell tables on paste', async () => {
  const onChange = vi.fn();
  render(<RichTextEditor initialHtmlContent="" onChange={onChange} />);

  const editor = await screen.findByTestId('rich-text-editor');
  fireEvent.paste(editor.querySelector('.tiptap')!, {
    clipboardData: {
      getData: () =>
        '<table><tr><td>Cell 1 contents</td><td>Cell 2 contents</td></tr></table>',
    },
  });

  await screen.findByRole('table');
  expect(onChange).toHaveBeenLastCalledWith(
    '<table style="min-width: 0px"><colgroup><col><col></colgroup><tbody><tr><td colspan="1" rowspan="1"><p>Cell 1 contents</p></td><td colspan="1" rowspan="1"><p>Cell 2 contents</p></td></tr></tbody></table>'
  );
});
