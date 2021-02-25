#include <math.h>
#include "image_t.h"

size_t min(size_t a, size_t b)
{
  return a < b ? a : b;
}

size_t max(size_t a, size_t b)
{
  return a > b ? a : b;
}

size_t interpolate(
    size_t k,
    size_t kMin,
    size_t kMax,
    size_t vMin,
    size_t vMax)
{
  return round((k - kMin) * vMax + (kMax - k) * vMin);
}

size_t interpolateHorizontal(
    image_t src,
    size_t offset,
    size_t x,
    size_t y,
    size_t xMin,
    size_t xMax)
{
  uint8_t vMin = src.data[(y * src.width + xMin) * src.channels + offset];
  if (xMin == xMax)
    return vMin;

  uint8_t vMax = src.data[(y * src.width + xMax) * src.channels + offset];
  return interpolate(x, xMin, xMax, vMin, vMax);
}

size_t interpolateVertical(
    image_t src,
    size_t offset,
    size_t x,
    size_t xMin,
    size_t xMax,
    size_t y,
    size_t yMin,
    size_t yMax)
{
  size_t vMin = interpolateHorizontal(src, offset, x, yMin, xMin, xMax);
  if (yMin == yMax)
    return vMin;

  size_t vMax = interpolateHorizontal(src, offset, x, yMax, xMin, xMax);
  return interpolate(y, yMin, yMax, vMin, vMax);
}

void bilinearInterpolationRgba(image_t src, image_t dst)
{
  size_t pos = 0;

  for (size_t y = 0; y < dst.height; y++)
  {
    for (size_t x = 0; x < dst.width; x++)
    {
      float srcX = ((float)(x * src.width)) / dst.width;
      float srcY = ((float)(y * src.height)) / dst.height;

      size_t xMin = floor(srcX);
      size_t yMin = floor(srcY);

      size_t xMax = min(ceil(srcX), src.width - 1);
      size_t yMax = min(ceil(srcY), src.height - 1);

      dst.data[pos++] = interpolateVertical(
          src,
          0,
          srcX,
          xMin,
          xMax,
          srcY,
          yMin,
          yMax); // R
      dst.data[pos++] = interpolateVertical(
          src,
          1,
          srcX,
          xMin,
          xMax,
          srcY,
          yMin,
          yMax); // G
      dst.data[pos++] = interpolateVertical(
          src,
          2,
          srcX,
          xMin,
          xMax,
          srcY,
          yMin,
          yMax); // B
      dst.data[pos++] = interpolateVertical(
          src,
          3,
          srcX,
          xMin,
          xMax,
          srcY,
          yMin,
          yMax); // A
    }
  }
}

void bilinearInterpolationLum(image_t src, image_t dst)
{
  size_t pos = 0;

  for (size_t y = 0; y < dst.height; y++)
  {
    for (size_t x = 0; x < dst.width; x++)
    {
      float srcX = ((float)(x * src.width)) / dst.width;
      float srcY = ((float)(y * src.height)) / dst.height;

      size_t xMin = floor(srcX);
      size_t yMin = floor(srcY);

      size_t xMax = min(ceil(srcX), src.width - 1);
      size_t yMax = min(ceil(srcY), src.height - 1);

      dst.data[pos++] = interpolateVertical(
          src,
          0,
          srcX,
          xMin,
          xMax,
          srcY,
          yMin,
          yMax); // L
    }
  }
}

int resize(image_t src, image_t dst)
{
  if (src.channels != dst.channels)
  {
    return 1;
  }

  if (src.channels == 4)
  {
    bilinearInterpolationRgba(src, dst);
  }
  else if (src.channels == 1)
  {
    bilinearInterpolationLum(src, dst);
  }
  else
  {
    return 1;
  }

  return 0;
}
