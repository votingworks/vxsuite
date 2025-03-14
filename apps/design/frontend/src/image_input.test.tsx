import { beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Buffer } from 'node:buffer';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/react_testing_library';
import { ImageInput } from './image_input';

const mockImage = {
  naturalWidth: 1,
  naturalHeight: 2,
  decode: vi.fn(() => Promise.resolve()),
} as const;

// Mock Image so we can test getting the dimensions of the uploaded image
HTMLImageElement.prototype.decode = function decode() {
  Object.defineProperties(this, {
    naturalWidth: { value: 1 },
    naturalHeight: { value: 2 },
  });
  return Promise.resolve();
};

describe('ImageInput', () => {
  beforeEach(() => {
    globalThis.Image = function Image() {
      return mockImage;
    } as unknown as typeof globalThis.Image;
  });

  test('accepts and sanitizes SVGs', async () => {
    const onChange = vi.fn();
    const unsafeContents = '<svg><script>alert("unsafe")</script></svg>';
    const sanitizedContents = '<svg></svg>';
    const svgFile = new File([unsafeContents], 'image.svg', {
      type: 'image/svg+xml',
    });
    render(
      <ImageInput
        value={undefined}
        onChange={onChange}
        buttonLabel="Upload"
        removeButtonLabel="Remove"
      />
    );
    const input = screen.getByLabelText('Upload');
    userEvent.upload(input, svgFile);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(sanitizedContents)
    );
  });

  test('shows a preview image', async () => {
    const imageContents = '<svg><circle r="1" fill="black" /></svg>';
    render(
      <ImageInput
        value={imageContents}
        onChange={vi.fn()}
        buttonLabel="Upload"
        removeButtonLabel="Remove"
      />
    );
    const previewImage = await screen.findByRole('img', {
      name: 'Upload preview',
    });
    expect(previewImage).toHaveAttribute(
      'src',
      `data:image/svg+xml;base64,${Buffer.from(imageContents).toString(
        'base64'
      )}`
    );
  });

  test('when required, blocks form submission if no value given', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ImageInput
          onChange={onChange}
          buttonLabel="Upload"
          removeButtonLabel="Remove"
          required
        />
        <button type="submit">Submit</button>
      </form>
    );
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    userEvent.click(submitButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('when required, does not block form submission if it has a value', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ImageInput
          value="<svg><circle r='1' fill='black' /></svg>"
          onChange={onChange}
          buttonLabel="Upload"
          removeButtonLabel="Remove"
          required
        />
        <button type="submit">Submit</button>
      </form>
    );
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    userEvent.click(submitButton);
    expect(onSubmit).toHaveBeenCalled();
  });

  test.each(['png', 'jpeg'])('converts %s images to SVG', async (imageType) => {
    const onChange = vi.fn();
    const imageContents = 'test image contents';
    const imageFile = new File([imageContents], `image.${imageType}`, {
      type: `image/${imageType}`,
    });
    const svgContents = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="2" viewBox="0 0 1 2">
    <image href="data:image/${imageType};base64,${Buffer.from(
      imageContents
    ).toString('base64')}" width="1" height="2"></image>
  </svg>`;
    render(
      <ImageInput
        value={undefined}
        onChange={onChange}
        buttonLabel="Upload"
        removeButtonLabel="Remove"
      />
    );
    const input = screen.getByLabelText('Upload');
    userEvent.upload(input, imageFile);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(svgContents));
  });

  test('rejects images that are too large', async () => {
    const tooLargeFile = new File([''], 'image.png', { type: 'image/png' });
    vi.spyOn(tooLargeFile, 'size', 'get').mockReturnValue(6 * 1_000 * 1_000);
    render(
      <ImageInput
        value={undefined}
        onChange={vi.fn()}
        buttonLabel="Upload"
        removeButtonLabel="Remove"
      />
    );

    const input = screen.getByLabelText<HTMLInputElement>('Upload');
    userEvent.upload(input, tooLargeFile);
    await waitFor(() => {
      expect(input.validationMessage).toEqual(
        'Image file size must be less than 5 MB'
      );
    });
  });

  test('allows removing the image', async () => {
    const onChange = vi.fn();
    render(
      <ImageInput
        value="test"
        onChange={onChange}
        buttonLabel="Upload"
        removeButtonLabel="Remove"
      />
    );
    const removeButton = screen.getByRole('button', { name: 'Remove' });
    userEvent.click(removeButton);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
  });
});

test('regression test #5967: does not crash when canceling an upload', () => {
  const onChange = vi.fn();
  render(
    <ImageInput
      value={undefined}
      onChange={onChange}
      buttonLabel="Upload"
      removeButtonLabel="Remove"
      required
    />
  );

  // Simulate a user canceling the file upload.
  // This is not a feature of `userEvent`: https://github.com/votingworks/vxsuite/pull/5976
  const input = screen.getByLabelText('Upload');
  fireEvent.change(input, { target: { files: null } });
});
