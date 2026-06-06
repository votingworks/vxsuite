import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { assert } from '@votingworks/basics';
import { render, screen } from '../../test/react_testing_library';
import { InputWithAudio, TextareaWithAudio } from './input_with_audio';
import { AudioLinkButton, AudioLinkButtonProps } from './audio_link_button';

vi.mock('./audio_link_button.js');

test('passes through input props', () => {
  const onChange = vi.fn((event: React.ChangeEvent<HTMLInputElement>) => {
    assert(event.target instanceof HTMLInputElement);
    expect(event.target.value).toEqual('hello!');
  });

  mockButtonComponent({
    'aria-label': 'Preview or Edit Audio',
    className: expect.any(String),
    to: '/audio/edit',
    tooltip: 'Preview/Edit Audio',
    tooltipPlacement: 'bottom',
  });

  render(
    <InputWithAudio
      audioScreenUrl="/audio/edit"
      editing={false}
      name="test_input"
      onChange={onChange}
      title="test_input"
      tooltipPlacement="bottom"
      value="hello"
    />
  );

  const input = screen.getByRole('textbox', { name: 'test_input' });
  expect(input).toHaveValue('hello');
  userEvent.type(input, '!');
  expect(onChange).toHaveBeenCalled();
});

test('omits button when editing', () => {
  render(
    <InputWithAudio
      audioScreenUrl="/audio/edit"
      editing
      defaultValue="General Election"
    />
  );

  const input = screen.getByRole('textbox');
  expect(input).toHaveValue('General Election');
  expect(screen.queryButton('Preview or Edit Audio')).not.toBeInTheDocument();
});

test('omits button when empty', () => {
  render(
    <InputWithAudio
      audioScreenUrl="/audio/edit"
      defaultValue=""
      editing={false}
    />
  );

  screen.getByRole('textbox');
  expect(screen.queryButton('Preview or Edit Audio')).not.toBeInTheDocument();
});

test('passes through textarea props and sizes rows to content', () => {
  const onChange = vi.fn((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    assert(event.target instanceof HTMLTextAreaElement);
    expect(event.target.value).toEqual('line one\nline two!');
  });

  mockButtonComponent({
    'aria-label': 'Preview or Edit Audio',
    className: expect.any(String),
    to: '/audio/edit',
    tooltip: 'Preview/Edit Audio',
    tooltipPlacement: 'bottom',
  });

  render(
    <TextareaWithAudio
      audioScreenUrl="/audio/edit"
      editing={false}
      name="test_textarea"
      onChange={onChange}
      title="test_textarea"
      tooltipPlacement="bottom"
      value={'line one\nline two'}
    />
  );

  const textarea = screen.getByRole('textbox', { name: 'test_textarea' });
  expect(textarea).toHaveValue('line one\nline two');
  expect(textarea).toHaveAttribute('rows', '2');
  userEvent.type(textarea, '!');
  expect(onChange).toHaveBeenCalled();
});

test('textarea omits button when editing', () => {
  render(
    <TextareaWithAudio
      audioScreenUrl="/audio/edit"
      editing
      readOnly
      value="General Election"
    />
  );

  const textarea = screen.getByRole('textbox');
  expect(textarea).toHaveValue('General Election');
  expect(textarea).toHaveAttribute('rows', '1');
  expect(screen.queryButton('Preview or Edit Audio')).not.toBeInTheDocument();
});

test('textarea omits button when empty', () => {
  render(
    <TextareaWithAudio
      audioScreenUrl="/audio/edit"
      editing={false}
      readOnly
      value=""
    />
  );

  screen.getByRole('textbox');
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
