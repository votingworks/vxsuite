import { Redirect, Route, Switch, useHistory } from 'react-router-dom';
import React, { useState, useEffect, useCallback } from 'react';
import { PrintScreen } from './screens/print_screen';
import { ReportScreen } from './screens/report_screen';
import { pollWorkerRoutes } from './routes';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper';
import { getLastBarcodePayload } from './api';

export function PollWorkerApp(): JSX.Element {
  const history = useHistory();
  const lastBarcodePayloadQuery = getLastBarcodePayload.useQuery();
  const [pendingBarcodeScan, setPendingBarcodeScan] = useState<
    string | undefined
  >();

  useEffect(() => {
    const result = lastBarcodePayloadQuery.data;
    if (!result) {
      return;
    }
    if (result.isErr()) {
      return;
    }
    const info = result.ok();
    if (!info) {
      return;
    }

    setPendingBarcodeScan(info);
  }, [lastBarcodePayloadQuery.data, history]);

  const onBarcodeScanConsumed = useCallback(
    () => setPendingBarcodeScan(undefined),
    []
  );

  return (
    <React.Fragment>
      <Switch>
        <Route
          path={pollWorkerRoutes.print.path}
          render={() => (
            <PrintScreen
              pendingBarcodeScan={pendingBarcodeScan}
              onBarcodeScanConsumed={onBarcodeScanConsumed}
            />
          )}
        />
        <Route
          path={pollWorkerRoutes.reports.path}
          render={() => <ReportScreen />}
        />
        <Redirect to={pollWorkerRoutes.print.path} />
      </Switch>
      <PrinterAlertWrapper />
    </React.Fragment>
  );
}
