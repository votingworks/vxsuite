import userEvent from '@testing-library/user-event';
import { Buffer } from 'buffer';
import { render, screen, waitFor } from '../test/react_testing_library';
import { ImageInput } from './image_input';

describe('ImageInput', () => {
  test('accepts and sanitizes SVGs', async () => {
    const onChange = jest.fn();
    const unsafeContents = '<svg><script>alert("unsafe")</script></svg>';
    const sanitizedContents = '<svg></svg>';
    const svgFile = new File([unsafeContents], 'image.svg', {
      type: 'image/svg+xml',
    });
    render(
      <ImageInput value={undefined} onChange={onChange} buttonLabel="Upload" />
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
        onChange={jest.fn()}
        buttonLabel="Upload"
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

  test.each(['png', 'jpeg'])('converts %s images to SVG', async (imageType) => {
    // Mock Image so we can test getting the dimensions of the uploaded image
    HTMLImageElement.prototype.decode = function decode() {
      Object.defineProperties(this, {
        naturalWidth: { value: 1 },
        naturalHeight: { value: 2 },
      });
      return Promise.resolve();
    };
    const onChange = jest.fn();
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
      <ImageInput value={undefined} onChange={onChange} buttonLabel="Upload" />
    );
    const input = screen.getByLabelText('Upload');
    userEvent.upload(input, imageFile);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(svgContents));
  });

  test('rejects images that are too large', async () => {
    const tooLargeFile = new File([''], 'image.png', { type: 'image/png' });
    jest.spyOn(tooLargeFile, 'size', 'get').mockReturnValue(6 * 1_000 * 1_000);
    const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation();
    render(
      <ImageInput value={undefined} onChange={jest.fn()} buttonLabel="Upload" />
    );

    const input = screen.getByLabelText('Upload');
    userEvent.upload(input, tooLargeFile);
    await waitFor(() => expect(consoleErrorMock).toHaveBeenCalled());
    expect(consoleErrorMock.mock.calls[0][0]['message']).toEqual(
      'Image file size must be less than 5 MB'
    );
  });
});
