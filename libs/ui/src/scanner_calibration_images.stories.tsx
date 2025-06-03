import { Meta } from '@storybook/react';

import {
  CalibrationInsertSingleSheetIllustration,
  CalibrationInsertDoubleSheetIllustration,
} from './scanner_calibration_images';

function ScannerCalibrationImages(): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <CalibrationInsertSingleSheetIllustration />
      <CalibrationInsertDoubleSheetIllustration />
    </div>
  );
}

const meta: Meta<typeof ScannerCalibrationImages> = {
  title: 'libs-ui/Images',
  component: ScannerCalibrationImages,
};

export default meta;

export { ScannerCalibrationImages };
