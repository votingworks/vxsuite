import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { sleep } from '@votingworks/basics';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { fireEvent, render, screen } from '../../test/react_testing_library';
import { RichTextEditorWithAudio } from './rich_text_editor_with_audio';

test('passes through editor props', async () => {
  const onChange = vi.fn((content: string) => {
    expect(content).toEqual('<p>hello!</p>');
  });

  render(
    <RichTextEditorWithAudio
      audioScreenUrl="/audio/edit"
      editing={false}
      onChange={onChange}
      initialHtmlContent="<p>hello</p>"
    />
  );

  const editor = screen.getByTestId('rich-text-editor');
  screen.getByText('hello');

  fireEvent.change(editor.querySelector('.tiptap')!, {
    target: { textContent: 'hello!' },
  });
  await sleep(0);
  expect(onChange).toHaveBeenCalled();
});

test('omits button when editing', () => {
  render(
    <RichTextEditorWithAudio
      audioScreenUrl="/audio/edit"
      editing
      initialHtmlContent="<p>Do you agree?<p>"
      onChange={vi.fn()}
    />
  );

  screen.getByTestId('rich-text-editor');
  screen.getByText('Do you agree?');
  expect(screen.queryButton('Preview or Edit Audio')).not.toBeInTheDocument();
});

test('omits button when empty', () => {
  render(
    <RichTextEditorWithAudio
      audioScreenUrl="/audio/edit"
      editing={false}
      initialHtmlContent=""
      onChange={vi.fn()}
    />
  );

  screen.getByTestId('rich-text-editor');
  expect(screen.queryButton('Preview or Edit Audio')).not.toBeInTheDocument();
});

test('audio button navigates to given href', () => {
  const history = createMemoryHistory({ initialEntries: ['/'] });

  render(
    <Router history={history}>
      <RichTextEditorWithAudio
        audioScreenUrl="/audio/edit"
        editing={false}
        initialHtmlContent="hello"
        onChange={vi.fn()}
      />
    </Router>
  );

  userEvent.click(screen.getButton('Preview or Edit Audio'));
  expect(history.location.pathname).toEqual('/audio/edit');
});

test('shows button tooltip on hover', () => {
  render(
    <RichTextEditorWithAudio
      audioScreenUrl="/audio/edit"
      editing={false}
      initialHtmlContent="hello"
      onChange={vi.fn()}
    />
  );

  userEvent.hover(screen.getButton('Preview or Edit Audio'));
  screen.getByText('Preview/Edit Audio');
});
