import * as cv from '@u4/opencv4nodejs';

import { OvalTemplate } from './types';
import { getShadedPixelRatio } from './utils';

/**
 * FIXME: openCV match search doesn't seem to work properly when we feed it with
 * the pre-loaded buffer data from oval_scan.png.ts. Works fine when we let
 * openCV handle the loading.
 */
export const ovalTemplatePromise: Promise<OvalTemplate> = cv
  .imreadAsync(
    `${__dirname}/../../../data/templates/oval_scan.png`,
    cv.IMREAD_GRAYSCALE
  )
  .then<OvalTemplate>(async (image) => ({
    image,
    shadedPixelRatio: await getShadedPixelRatio(image),
  }));
