import { beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Buffer } from 'node:buffer';
import { images } from '@votingworks/ui';
import { err, ok } from '@votingworks/basics';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/react_testing_library';
import { ImageInput } from './image_input';

vi.mock(import('@votingworks/ui'), async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    images: { ...actual.images, normalizeFile: vi.fn() },
  };
});

const mockNormalizeFile = vi.mocked(images.normalizeFile);
const MOCK_NORMALIZED_IMAGE: Readonly<images.NormalizedImage> = {
  dataUrl: 'very_normal_image',
  heightPx: 300,
  widthPx: 300,
};

describe('ImageInput', () => {
  beforeEach(() => {
    mockNormalizeFile.mockResolvedValue(ok(MOCK_NORMALIZED_IMAGE));
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
    const imageFile = new File([imageContents], `image.${imageType}`, {
      type: `image/${imageType}`,
    });

    const { dataUrl, heightPx, widthPx } = MOCK_NORMALIZED_IMAGE;
    const svgViewBox = `0 0 ${widthPx} ${heightPx}`;
    const svgDimensions = `width="${widthPx}" height="${heightPx}"`;

    const svgContents = `<svg xmlns="http://www.w3.org/2000/svg" ${svgDimensions} viewBox="${svgViewBox}">
    <image href="${dataUrl}" ${svgDimensions}></image>
  </svg>`;

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
    userEvent.upload(input, imageFile);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(svgContents));

    expect(mockNormalizeFile).toHaveBeenCalledWith(imageFile, {
      maxWidthPx: 300,
    });
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
      error: images.NormalizeError,
      msg: string | RegExp
    ) {
      mockNormalizeFile.mockResolvedValueOnce(err(error));

      const file = new File([''], 'image.png', { type: 'image/png' });
      userEvent.upload(input, file);

      await waitFor(() => expect(input.validationMessage).toMatch(msg));
    }

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
