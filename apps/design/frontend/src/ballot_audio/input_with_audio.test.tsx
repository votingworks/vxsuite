import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { assert } from '@votingworks/basics';
import { render, screen } from '../../test/react_testing_library';
import { InputWithAudio } from './input_with_audio';
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
