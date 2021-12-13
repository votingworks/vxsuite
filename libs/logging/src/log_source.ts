export enum LogSource {
  System = 'system',
  VxAdminFrontend = 'vx-admin-frontend',
  VxAdminService = 'vx-admin-service',
  VxBatchScanFrontend = 'vx-batch-scan-frontend',
  VxBatchScanService = 'vx-batch-scan-service',
  VxPrecinctScanFrontend = 'vx-precinct-scan-frontend',
  VxPrecinctScanService = 'vx-precinct-scan-service',
  VxBallotMarkingDeviceFrontend = 'vx-ballot-marking-device-frontend',
  VxBallotMarkingDeviceService = 'vx-ballot-marking-device-service',
  VxBallotActivationFrontend = 'vx-ballot-activation-frontend',
  VxBallotActivationService = 'vx-ballot-activation-service',
  VxScanService = 'vx-scan-service',
}
// The following log sources are frontends and always expect to log through window.kiosk
// In various tests window.kiosk may not be defined and we don't want to fallback to logging with console.log
// to avoid unnecessary log spew in the test runs.
export const CLIENT_SIDE_LOG_SOURCES = [
  LogSource.VxAdminFrontend,
  LogSource.VxBatchScanFrontend,
  LogSource.VxPrecinctScanFrontend,
  LogSource.VxBallotMarkingDeviceFrontend,
  LogSource.VxBallotActivationFrontend,
];
