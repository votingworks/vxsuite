import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import {
  CalibrationInsertSingleSheetIllustration,
  CalibrationInsertDoubleSheetIllustration,
} from './scanner_calibration_images.js';

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
