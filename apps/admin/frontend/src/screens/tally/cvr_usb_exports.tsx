/* istanbul ignore file - TODO: remove when implemented. */
import React from 'react';

import { CvrImporter } from './cvr_importer';

type Importer = Exclude<CvrImporter, { state: 'loading' | 'noUsb' }>;

export function CvrUsbExports(props: { importer: Importer }): React.ReactNode {
  const { importer } = props;

  // [TODO]
  return <div>Importer state: {importer.state}</div>;
}
