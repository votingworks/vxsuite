import { expect, test, vi } from 'vitest';
import { sleep } from '@votingworks/basics';
import { fireEvent, render, screen } from '../../test/react_testing_library';
import { RichTextEditorWithAudio } from './rich_text_editor_with_audio';
import { AudioLinkButtonProps, AudioLinkButton } from './audio_link_button';

vi.mock('./audio_link_button.js');

test('passes through editor props', async () => {
  const onChange = vi.fn((content: string) => {
    expect(content).toEqual('<p>hello!</p>');
  });

  mockButtonComponent({
    'aria-label': 'Preview or Edit Audio',
    to: '/audio/edit',
    tooltip: 'Preview/Edit Audio',
    tooltipPlacement: 'bottom',
  });

  render(
    <RichTextEditorWithAudio
      audioScreenUrl="/audio/edit"
      editing={false}
      onChange={onChange}
      initialHtmlContent="<p>hello</p>"
      tooltipPlacement="bottom"
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

function mockButtonComponent(
  expectedProps: AudioLinkButtonProps & React.HTMLAttributes<HTMLButtonElement>
) {
  const testId = 'MockAudioLinkButton';
  vi.mocked(AudioLinkButton).mockImplementation((props) => {
    expect(props).toEqual(expectedProps);
    return <span data-testid={testId} />;
  });

  return { testId };
}
