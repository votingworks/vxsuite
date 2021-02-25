#include <stdlib.h>
#include <stdint.h>

#ifndef IMAGE_T_H
#define IMAGE_T_H

typedef struct
{
  uint8_t *data;
  size_t width;
  size_t height;
  size_t channels;
} image_t;

#endif // IMAGE_T_H
