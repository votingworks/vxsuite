#include "image_t.h"
#include <stdio.h>

int grayscale(image_t src, image_t dst, uint8_t background)
{
  if (src.width != dst.width || src.height != dst.height)
  {
    return 1;
  }

  if (src.channels != 4 || dst.channels != 1)
  {
    return 1;
  }

  size_t src_offset = src.width * src.height * src.channels;
  size_t dst_offset = dst.width * dst.height * dst.channels;

  do
  {
    src_offset -= src.channels;
    dst_offset -= dst.channels;

    float r = (float)src.data[src_offset];
    float g = (float)src.data[src_offset + 1];
    float b = (float)src.data[src_offset + 2];
    float a = ((float)src.data[src_offset + 3]) / 0xff;

    // Luminosity grayscale formula.
    dst.data[dst_offset] = (uint8_t)(a * (0.21 * r + 0.72 * g + 0.07 * b) + (1 - a) * background);
  } while (src_offset != 0);

  return 0;
}
