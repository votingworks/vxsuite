import React, { useEffect, useState } from 'react';
import type { VxScanApi, Config } from '@votingworks/vx-scan-backend';
import grout from '@votingworks/grout';

const apiClient = grout.buildClient<VxScanApi>();

export function App(): JSX.Element {
  const [config, setConfig] = React.useState<Config | undefined>();

  useEffect(() => {
    (async () => {
      const config = await apiClient.getConfig();
      setConfig(config);
    })();
  }, []);

  return (
    <div>
      <h1>Hello world</h1>
      <p>Config:</p>
      <pre>{JSON.stringify(config, null, 2)}</pre>
    </div>
  );
}
