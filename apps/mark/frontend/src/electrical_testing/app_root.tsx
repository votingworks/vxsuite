/* istanbul ignore file - @preserve */
import {
  Button,
  CpuMetricsDisplay,
  ElectricalTestingScreen,
  Icons,
  InputControls,
} from '@votingworks/ui';
import React, { useState } from 'react';
import useInterval from 'use-interval';
import {
  getBarcodeStatus,
  getCpuMetrics,
  getElectricalTestingStatuses,
  getPrinterStatus,
  getPrinterTaskStatus,
  printTestPage,
  setCardReaderTaskRunning,
  setPrinterTaskRunning,
  setUsbDriveTaskRunning,
  systemCallApi,
} from './api';
import { useSound } from '../hooks/use_sound';

const SOUND_INTERVAL_SECONDS = 5;

function formatPrinterStatus(
  printerStatus: Awaited<ReturnType<typeof getPrinterStatus.useQuery>>['data'],
  taskStatus: Awaited<ReturnType<typeof getPrinterTaskStatus.useQuery>>['data']
): string {
  if (!printerStatus) {
    return 'Unknown';
  }

  if (!printerStatus.connected) {
    return 'Not Connected';
  }

  const status = printerStatus.richStatus?.state ?? 'Connected';
  const taskState =
    taskStatus?.taskStatus === 'running' ? 'Auto-print ON' : 'Auto-print OFF';
  return `${status} (${taskState})`;
}

function formatBarcodeStatus(
  barcodeStatus: Awaited<ReturnType<typeof getBarcodeStatus.useQuery>>['data']
): React.ReactNode {
  if (!barcodeStatus) {
    return 'Unknown';
  }

  if (!barcodeStatus.connected) {
    return 'Not Connected';
  }

  if (barcodeStatus.lastScan) {
    const timestamp = barcodeStatus.lastScanTimestamp
      ? barcodeStatus.lastScanTimestamp.toLocaleTimeString()
      : '';
    return (
      <span>
        Connected
        <br />
        Last scan ({timestamp}):
        <br />
        Data: {barcodeStatus.lastScan.data}
      </span>
    );
  }

  return 'Connected - No scans yet';
}

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusesQuery =
    getElectricalTestingStatuses.useQuery();
  const getCpuMetricsQuery = getCpuMetrics.useQuery();
  const getPrinterStatusQuery = getPrinterStatus.useQuery();
  const getPrinterTaskStatusQuery = getPrinterTaskStatus.useQuery();
  const getBarcodeStatusQuery = getBarcodeStatus.useQuery();
  const setCardReaderTaskRunningMutation =
    setCardReaderTaskRunning.useMutation();
  const setUsbDriveTaskRunningMutation = setUsbDriveTaskRunning.useMutation();
  const setPrinterTaskRunningMutation = setPrinterTaskRunning.useMutation();
  const printTestPageMutation = printTestPage.useMutation();
  const powerDownMutation = systemCallApi.powerDown.useMutation();

  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const playSound = useSound('success-5s');

  function toggleCardReaderTaskRunning() {
    setCardReaderTaskRunningMutation.mutate(
      getElectricalTestingStatusesQuery.data?.card?.taskStatus === 'paused'
    );
  }

  function toggleUsbDriveTaskRunning() {
    setUsbDriveTaskRunningMutation.mutate(
      getElectricalTestingStatusesQuery.data?.usbDrive?.taskStatus === 'paused'
    );
  }

  function togglePrinterTaskRunning() {
    setPrinterTaskRunningMutation.mutate(
      getPrinterTaskStatusQuery.data?.taskStatus === 'paused'
    );
  }

  function toggleSoundEnabled() {
    setIsSoundEnabled((prev) => !prev);
  }

  function powerDown() {
    powerDownMutation.mutate();
  }

  useInterval(playSound, isSoundEnabled ? SOUND_INTERVAL_SECONDS * 1000 : null);

  const cardStatus = getElectricalTestingStatusesQuery.data?.card;
  const usbDriveStatus = getElectricalTestingStatusesQuery.data?.usbDrive;

  return (
    <React.Fragment>
      <CpuMetricsDisplay
        metrics={getCpuMetricsQuery.data}
        orientation="portrait"
      />
      <ElectricalTestingScreen
        topOffset="100px"
        tasks={[
          {
            id: 'card',
            icon: <Icons.SimCard />,
            title: 'Card Reader',
            statusMessage: cardStatus?.statusMessage ?? 'Unknown',
            isRunning: cardStatus?.taskStatus === 'running',
            toggleIsRunning: toggleCardReaderTaskRunning,
            updatedAt: cardStatus?.updatedAt,
          },
          {
            id: 'usbDrive',
            icon: <Icons.UsbDrive />,
            title: 'USB Drive',
            statusMessage: usbDriveStatus?.statusMessage ?? 'Unknown',
            isRunning: usbDriveStatus?.taskStatus === 'running',
            toggleIsRunning: toggleUsbDriveTaskRunning,
            updatedAt: usbDriveStatus?.updatedAt,
          },
          {
            id: 'printer',
            icon: <Icons.Print />,
            title: 'Printer',
            body: (
              <React.Fragment>
                {formatPrinterStatus(
                  getPrinterStatusQuery.data,
                  getPrinterTaskStatusQuery.data
                )}
                <br />
                <Button
                  style={{ transform: 'scale(0.5)' }}
                  onPress={() => printTestPageMutation.mutate()}
                  disabled={
                    printTestPageMutation.isLoading ||
                    !getPrinterStatusQuery.data?.connected
                  }
                >
                  {printTestPageMutation.isLoading
                    ? 'Printing...'
                    : 'Print Test Page'}
                </Button>
              </React.Fragment>
            ),
            isRunning: getPrinterTaskStatusQuery.data?.taskStatus === 'running',
            toggleIsRunning: togglePrinterTaskRunning,
          },
          {
            id: 'barcodeScanner',
            icon: <Icons.Search />,
            title: 'Barcode Scanner',
            body: formatBarcodeStatus(getBarcodeStatusQuery.data),
          },
          {
            id: 'sound',
            icon: isSoundEnabled ? <Icons.VolumeUp /> : <Icons.VolumeMute />,
            title: 'Sound',
            body: isSoundEnabled ? 'Enabled' : 'Disabled',
            isRunning: isSoundEnabled,
            toggleIsRunning: toggleSoundEnabled,
          },
          {
            id: 'inputs',
            icon: <Icons.Mouse />,
            title: 'Inputs',
            body: <InputControls />,
          },
        ]}
        perRow={1}
        powerDown={powerDown}
        usbDriveStatus={usbDriveStatus?.underlyingDeviceStatus}
      />
    </React.Fragment>
  );
}
