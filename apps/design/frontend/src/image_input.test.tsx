import { describe, expect, test, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Buffer } from 'node:buffer';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/react_testing_library';
import { ImageInput } from './image_input';
import { normalizeImageToSvg, NormalizeParams } from './image_normalization';

vi.mock('./image_normalization', { spy: true });

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

  describe('bitmap images', () => {
    const originalImageSrc = Object.getOwnPropertyDescriptor(
      global.Image.prototype,
      'src'
    );
    afterEach(() => {
      Object.defineProperty(global.Image.prototype, 'src', originalImageSrc!);
    });

    function mockLoadImage(dataUrl: string, width: number, height: number) {
      Object.defineProperty(global.Image.prototype, 'src', {
        set(src: string) {
          expect(src).toEqual(dataUrl);
          setImmediate(() => {
            this.width = width;
            this.height = height;
            this.dispatchEvent(new Event('load'));
          });
        },
      });
    }

    test.each(['png', 'jpeg'])(
      'converts %s images to SVG',
      async (imageType) => {
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
        mockLoadImage(imageDataUrl, imageWidth, imageHeight);

        const normalizeParams: NormalizeParams = {
          maxWidthPx: imageWidth,
          maxHeightPx: imageHeight,
        };

        render(
          <ImageInput
            value={undefined}
            onChange={onChange}
            buttonLabel="Upload"
            removeButtonLabel="Remove"
            normalizeParams={normalizeParams}
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

        expect(normalizeImageToSvg).toHaveBeenCalledWith(
          imageFile,
          normalizeParams
        );
      }
    );

    test('unwraps bitmap images from SVGs', async () => {
      const onChange = vi.fn();

      const bitmapImageContents = 'test bitmap image contents';
      const bitmapImageDataUrl = `data:image/png;base64,${Buffer.from(
        bitmapImageContents
      ).toString('base64')}`;
      const imageWidth = 50;
      const imageHeight = 100;
      mockLoadImage(bitmapImageDataUrl, imageWidth, imageHeight);

      const svgImageContents = `<svg><image href="${bitmapImageDataUrl}" width="${imageWidth}" height="${imageHeight}"></image></svg>`;
      const svgImageFile = new File([svgImageContents], 'image.svg', {
        type: 'image/svg+xml',
      });

      const normalizeParams: NormalizeParams = {
        maxWidthPx: imageWidth,
        maxHeightPx: imageHeight,
      };
      render(
        <ImageInput
          value={undefined}
          onChange={onChange}
          buttonLabel="Upload"
          removeButtonLabel="Remove"
          normalizeParams={normalizeParams}
        />
      );

      userEvent.upload(screen.getByLabelText('Upload'), svgImageFile);
      await waitFor(() =>
        expect(onChange)
          .toHaveBeenCalledWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
    <image href="${bitmapImageDataUrl}" width="${imageWidth}" height="${imageHeight}"></image>
  </svg>`)
      );

      expect(normalizeImageToSvg).toHaveBeenCalledWith(
        svgImageFile,
        normalizeParams
      );
    });

    test('rejects images that are too narrow', async () => {
      const normalizeParams: NormalizeParams = {
        maxWidthPx: 300,
        minWidthPx: 100,
      };
      mockLoadImage(
        'data:image/png;base64,',
        normalizeParams.minWidthPx! - 1,
        100
      );
      render(
        <ImageInput
          value={undefined}
          onChange={vi.fn()}
          buttonLabel="Upload"
          removeButtonLabel="Remove"
          normalizeParams={normalizeParams}
        />
      );
      const input = screen.getByLabelText<HTMLInputElement>('Upload');
      userEvent.upload(
        input,
        new File([''], 'image.png', { type: 'image/png' })
      );
      await waitFor(() => {
        expect(input.validationMessage).toEqual(
          'Image width (99px) is smaller than minimum (100px).'
        );
      });
    });

    test('rejects images that are too short', async () => {
      const normalizeParams: NormalizeParams = {
        maxHeightPx: 300,
        minHeightPx: 100,
      };
      mockLoadImage(
        'data:image/png;base64,',
        100,
        normalizeParams.minHeightPx! - 1
      );
      render(
        <ImageInput
          value={undefined}
          onChange={vi.fn()}
          buttonLabel="Upload"
          removeButtonLabel="Remove"
          normalizeParams={normalizeParams}
        />
      );
      const input = screen.getByLabelText<HTMLInputElement>('Upload');
      userEvent.upload(
        input,
        new File([''], 'image.png', { type: 'image/png' })
      );
      await waitFor(() => {
        expect(input.validationMessage).toEqual(
          'Image height (99px) is smaller than minimum (100px).'
        );
      });
    });

    test('handles unexpected errors when loading images', async () => {
      render(
        <ImageInput
          value={undefined}
          onChange={vi.fn()}
          buttonLabel="Upload"
          removeButtonLabel="Remove"
          normalizeParams={{ maxWidthPx: 300 }}
        />
      );

      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        set() {
          setImmediate(() => {
            this.dispatchEvent(new Event('error'));
          });
        },
      });
      const input = screen.getByLabelText<HTMLInputElement>('Upload');
      userEvent.upload(
        input,
        new File([''], 'image.png', { type: 'image/png' })
      );
      await waitFor(() => {
        expect(input.validationMessage).toEqual(
          'Something went wrong. Please refresh the page and try again.'
        );
      });
    });
  });

  const validationTestCases = [
    {
      title: 'Non SVG tag',
      normalizeParams: { maxWidthPx: 300 },
      imageFile: new File(['<div></div>'], 'image.svg', {
        type: 'image/svg+xml',
      }),
      expectedMessage: 'This image is not a valid SVG.',
    },
    {
      title: 'SVG image without href',
      normalizeParams: { maxWidthPx: 300 },
      imageFile: new File(['<svg><image /></svg>'], 'image.svg', {
        type: 'image/svg+xml',
      }),
      expectedMessage: 'This image is not a valid SVG.',
    },
    {
      title: 'SVG with multiple images',
      normalizeParams: { maxWidthPx: 300 },
      imageFile: new File(
        ['<svg><image href="abc" /><image href="abc" /></svg>'],
        'image.svg',
        {
          type: 'image/svg+xml',
        }
      ),
      expectedMessage: 'This image is not a valid SVG.',
    },
    {
      title: 'Invalid mime type',
      normalizeParams: { maxWidthPx: 300 },
      imageFile: new File([''], 'image.gif', { type: 'image/gif' }),
      expectedMessage:
        'This image type is not supported. Please try uploading a file with one of the following extensions: .jpg, .jpeg, .png, .svg',
    },
  ];
  for (const {
    title,
    normalizeParams,
    imageFile,
    expectedMessage,
  } of validationTestCases) {
    test(`validation error: ${title}`, async () => {
      render(
        <ImageInput
          value={undefined}
          onChange={vi.fn()}
          buttonLabel="Upload"
          removeButtonLabel="Remove"
          normalizeParams={normalizeParams}
        />
      );
      const input = screen.getByLabelText<HTMLInputElement>('Upload');
      userEvent.upload(input, imageFile);
      await waitFor(() =>
        expect(input.validationMessage).toEqual(expectedMessage)
      );
    });
  }

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
