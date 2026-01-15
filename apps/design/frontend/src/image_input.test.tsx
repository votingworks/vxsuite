import { describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Buffer } from 'node:buffer';
import { err } from '@votingworks/basics';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/react_testing_library';
import { ImageInput } from './image_input';
import { NormalizeError, normalizeImageToSvg } from './image_normalization';

vi.mock('./image_normalization', { spy: true });
const mockNormalizeImageToSvg = vi.mocked(normalizeImageToSvg);

describe('ImageInput', () => {
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
        normalizeParams={{ maxWidthPx: 300 }}
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
        normalizeParams={{ maxWidthPx: 300 }}
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
          normalizeParams={{ maxWidthPx: 300 }}
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
          normalizeParams={{ maxWidthPx: 300 }}
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
    const imageWidth = 50;
    const imageHeight = 100;
    const imageFile = new File([imageContents], `image.${imageType}`, {
      type: `image/${imageType}`,
    });
    const imageDataUrl = `data:image/${imageType};base64,${Buffer.from(
      imageContents
    ).toString('base64')}`;

    // Mock the Image src setter to simulate loading the image
    const originalImageSrc = Object.getOwnPropertyDescriptor(
      global.Image.prototype,
      'src'
    );
    Object.defineProperty(global.Image.prototype, 'src', {
      set(src: string) {
        expect(src).toEqual(imageDataUrl);
        setImmediate(() => {
          this.width = imageWidth;
          this.height = imageHeight;
          this.dispatchEvent(new Event('load'));
        });
      },
    });

    render(
      <ImageInput
        value={undefined}
        onChange={onChange}
        buttonLabel="Upload"
        removeButtonLabel="Remove"
        normalizeParams={{ maxWidthPx: imageWidth, maxHeightPx: imageHeight }}
      />
    );

    const input = screen.getByLabelText('Upload');
    userEvent.upload(input, imageFile);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
    <image href="${imageDataUrl}" width="${imageWidth}" height="${imageHeight}"></image>
  </svg>`
      )
    );

    // Restore the original Image src property
    Object.defineProperty(global.Image.prototype, 'src', originalImageSrc!);
  });

  test('displays validation errors', async () => {
    render(
      <ImageInput
        value={undefined}
        onChange={vi.fn()}
        buttonLabel="Upload"
        removeButtonLabel="Remove"
        normalizeParams={{
          maxWidthPx: 300,
          minHeightPx: 300,
          minWidthPx: 300,
        }}
      />
    );

    const input = screen.getByLabelText<HTMLInputElement>('Upload');

    async function expectDisplayedError(
      error: NormalizeError,
      msg: string | RegExp
    ) {
      mockNormalizeImageToSvg.mockResolvedValueOnce(err(error));
      const file = new File([''], 'image.png', { type: 'image/png' });
      userEvent.upload(input, file);
      await waitFor(() => expect(input.validationMessage).toMatch(msg));
    }

    await expectDisplayedError(
      { code: 'invalidSvg' },
      'This image is not a valid SVG.'
    );

    await expectDisplayedError(
      { code: 'belowMinHeight', heightPx: 200 },
      'Image height (200px) is smaller than minimum (300px).'
    );

    await expectDisplayedError(
      { code: 'belowMinWidth', widthPx: 128 },
      'Image width (128px) is smaller than minimum (300px).'
    );

    await expectDisplayedError(
      { code: 'unsupportedImageType' },
      /image type is not supported/i
    );

    await expectDisplayedError(
      { code: 'unexpected', error: new Error('no clue') },
      /something went wrong/i
    );
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
        normalizeParams={{ maxWidthPx: 300 }}
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
        normalizeParams={{ maxWidthPx: 300 }}
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
      normalizeParams={{ maxWidthPx: 300 }}
    />
  );

  // Simulate a user canceling the file upload.
  // This is not a feature of `userEvent`: https://github.com/votingworks/vxsuite/pull/5976
  const input = screen.getByLabelText('Upload');
  fireEvent.change(input, { target: { files: null } });
});
