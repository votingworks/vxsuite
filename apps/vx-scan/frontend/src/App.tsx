import React, { useEffect, useState } from 'react';
import type {
  ApiDefinition,
  Config,
  Api,
  AnyRoutes,
} from '@votingworks/vx-scan-backend';

type AnyApi = Api<AnyRoutes>;

type inferApiRoutes<TApi extends AnyApi> = TApi extends Api<infer TRoutes>
  ? TRoutes
  : never;

type Client<TApi extends AnyApi> = inferApiRoutes<TApi>;

function buildClient<TApi extends AnyApi>(): Client<TApi> {
  return new Proxy({} as Client<TApi>, {
    get(_target, methodName: string) {
      return async (...args: any[]) => {
        console.log({ methodName, args });
        const response = await fetch(`/api/${methodName}`);
        return await response.json();
      };
    },
  });
}

const apiClient = buildClient<ApiDefinition>();

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
