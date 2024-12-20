
# VotingWorks Log Documentation
## Event Types
Types are logged with each log line to categorize the log.
### user-action
**Description:** A log that results from a user taking an action, i.e. an election admin uploading an election definition to a machine.
### application-status
**Description:** Status update or message that the application took without user action.
### system-action
**Description:** A log that results from the system taking some action, i.e. the machine booting.
### system-status
**Description:** A log that results from the system updating on the status of a process it is running, i.e. completion of machine shutdown or boot.
### application-action
**Description:** Action taken by the votingworks application automatically when a certain condition is met. Example: When a new USB drive is detected, the application will automatically mount it.
## Event IDs
IDs are logged with each log to identify the log being written.
### election-configured
**Type:** [user-action](#user-action)  
**Description:** The user has configured current machine to a new election definition.  
**Machines:** All
### election-unconfigured
**Type:** [user-action](#user-action)  
**Description:** The user has unconfigured current machine to remove the current election definition, and all other data.  
**Machines:** All
### auth-pin-entry
**Type:** [user-action](#user-action)  
**Description:** A user entered a PIN to log in.  
**Machines:** All
### auth-pin-entry-lockout
**Type:** [user-action](#user-action)  
**Description:** A user entered an incorrect PIN to log in, locking out their account until the indicated time.  
**Machines:** All
### auth-login
**Type:** [user-action](#user-action)  
**Description:** A user logged in (or failed to log in). An optional reason key may be provided for failures.  
**Machines:** All
### auth-voter-session-updated
**Type:** [user-action](#user-action)  
**Description:** Session parameters for a logged in voter were updated.  
**Machines:** All
### auth-logout
**Type:** [user-action](#user-action)  
**Description:** A user logged out (or failed to log out).  
**Machines:** All
### usb-drive-eject-init
**Type:** [user-action](#user-action)  
**Description:** A request to eject the current USB drive was made by the user, the USB drive will now be ejected.  
**Machines:** All
### usb-drive-eject-complete
**Type:** [application-status](#application-status)  
**Description:** Attempt to eject USB drive complete. Success or failure indicated by disposition.  
**Machines:** All
### usb-drive-mount-init
**Type:** [application-action](#application-action)  
**Description:** The USB drive is attempting to mount. This action is taken automatically by the application when a new USB drive is detected.  
**Machines:** All
### usb-drive-mount-complete
**Type:** [application-status](#application-status)  
**Description:** Attempt to mount USB drive mount complete. Success or failure indicated by disposition.  
**Machines:** All
### usb-drive-format-init
**Type:** [user-action](#user-action)  
**Description:** A request to format the current USB drive was made by the user. The usb drive will now be reformatted for compatibility with VotingWorks software.  
**Machines:** All
### usb-drive-format-complete
**Type:** [application-status](#application-status)  
**Description:** Attempt to reformat USB drive complete. Success or failure indicated by disposition.  
**Machines:** All
### application-startup
**Type:** [application-status](#application-status)  
**Description:** Application finished starting up, success or failure indicated by disposition.  
**Machines:** All
### printer-config-added
**Type:** [application-status](#application-status)  
**Description:** Application saw a printer configuration added to the system, current connection status of that printer is logged.  
**Machines:** All
### printer-config-removed
**Type:** [application-status](#application-status)  
**Description:** Application saw a printer configuration removed from the system.  
**Machines:** All
### printer-status-changed
**Type:** [application-status](#application-status)  
**Description:** Application saw a change in the status of the currently connected printer.  
**Machines:** All
### printer-print-request
**Type:** [user-action](#user-action)  
**Description:** A print request was triggered.  
**Machines:** All
### printer-print-complete
**Type:** [user-action](#user-action)  
**Description:** A print request was completed. Success or failure is indicated by disposition.  
**Machines:** All
### device-attached
**Type:** [application-status](#application-status)  
**Description:** Application saw a device attached to the system.  
**Machines:** All
### device-unattached
**Type:** [application-status](#application-status)  
**Description:** Application saw a device unattached from the system.  
**Machines:** All
### workspace-config
**Type:** [application-status](#application-status)  
**Description:** Message from the backend service about how it is configured while starting up.  
**Machines:** All
### toggle-test-mode-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated toggling between test mode and live mode in the current application.  
**Machines:** All
### toggled-test-mode
**Type:** [user-action](#user-action)  
**Description:** User has finished toggling between live mode and test mode in the given application. Success or failure is indicated by the disposition.  
**Machines:** All
### file-saved
**Type:** [user-action](#user-action)  
**Description:** File is saved to a USB drive. Success or failure indicated by disposition. Type of file specified with "fileType" key. For success logs the saved filename specified with "filename" key.  
**Machines:** All
### convert-log-cdf-complete
**Type:** [user-action](#user-action)  
**Description:** The user has converted the log file to a CDF format for saving. Success or failure indicated by disposition.  
**Machines:** All
### convert-log-cdf-log-line-error
**Type:** [user-action](#user-action)  
**Description:** Error seen when converting a single log to the CDF format. This log line will be skipped. Disposition of this log is always failure.  
**Machines:** All
### reboot-machine
**Type:** [user-action](#user-action)  
**Description:** User has triggered a reboot of the machine.  
**Machines:** All
### power-down-machine
**Type:** [user-action](#user-action)  
**Description:** User has triggered the machine to power down.  
**Machines:** All
### diagnostic-init
**Type:** [user-action](#user-action)  
**Description:** The user has started a hardware diagnostic.  
**Machines:** All
### diagnostic-error
**Type:** [user-action](#user-action)  
**Description:** An error occurred when running a diagnostic.  
**Machines:** All
### diagnostic-complete
**Type:** [user-action](#user-action)  
**Description:** The user has completed a hardware diagnostic.  
**Machines:** All
### readiness-report-printed
**Type:** [user-action](#user-action)  
**Description:** The user has printed an equipment readiness report.  
**Machines:** All
### readiness-report-saved
**Type:** [user-action](#user-action)  
**Description:** The user has saved an equipment readiness report.  
**Machines:** All
### headphones-detection-errors
**Type:** [application-status](#application-status)  
**Description:** Error while attempting to detect headphones.  
**Machines:** All
### unknown-error
**Type:** [application-status](#application-status)  
**Description:** Machine encountered an unknown error.  
**Machines:** All
### permission-denied
**Type:** [system-status](#system-status)  
**Description:** Permission denied when performing a system action.  
**Machines:** All
### parse-error
**Type:** [system-action](#system-action)  
**Description:** A system action failed to parse data.  
**Machines:** All
### database-connect-init
**Type:** [system-action](#system-action)  
**Description:** Initiating connection to the database.  
**Machines:** All
### database-connect-complete
**Type:** [system-action](#system-action)  
**Description:** Database connection established. Success or failure indicated by disposition.  
**Machines:** All
### database-create-init
**Type:** [system-action](#system-action)  
**Description:** Initiating creation of the database.  
**Machines:** All
### database-create-complete
**Type:** [system-action](#system-action)  
**Description:** Database created and setup. Success or failure indicated by disposition.  
**Machines:** All
### database-destroy-init
**Type:** [system-action](#system-action)  
**Description:** Initiating destruction of the database.  
**Machines:** All
### database-destroy-complete
**Type:** [system-action](#system-action)  
**Description:** Database destroyed. Success or failure indicated by disposition.  
**Machines:** All
### file-read-error
**Type:** [system-action](#system-action)  
**Description:** A system action failed to read a file from disk.  
**Machines:** All
### dmverity-boot
**Type:** [system-status](#system-status)  
**Description:** The system booted with dm-verity enabled.  
**Machines:** All
### machine-boot-init
**Type:** [system-action](#system-action)  
**Description:** The machine is beginning the boot process.  
**Machines:** All
### machine-boot-complete
**Type:** [system-status](#system-status)  
**Description:** The machine has completed the boot process.  
**Machines:** All
### machine-shutdown-init
**Type:** [system-action](#system-action)  
**Description:** The machine is beginning the shutdown process to power down or reboot, as indicated by the message.  
**Machines:** All
### machine-shutdown-complete
**Type:** [system-status](#system-status)  
**Description:** The machine has completed all the steps to shutdown and will now power down or reboot.  
**Machines:** All
### usb-device-change-detected
**Type:** [system-status](#system-status)  
**Description:** A message from the machine kernel about an externally-connected USB device, usually when a new device is connected or disconnected.  
**Machines:** All
### info
**Type:** [system-status](#system-status)  
**Description:** The process is reporting general status.  
**Machines:** All
### heartbeat
**Type:** [system-status](#system-status)  
**Description:** The process sent a heartbeat  
**Machines:** All
### process-started
**Type:** [system-action](#system-action)  
**Description:** A VotingWorks-authored process (eg. hardware daemon) has been started.  
**Machines:** All
### process-terminated
**Type:** [system-action](#system-action)  
**Description:** A VotingWorks-authored process (eg. hardware daemon) has been terminated.  
**Machines:** All
### sudo-action
**Type:** [user-action](#user-action)  
**Description:** A command was executed with sudo privileges.  
**Machines:** All
### password-change
**Type:** [user-action](#user-action)  
**Description:** A password change was executed.  
**Machines:** All
### save-election-package-init
**Type:** [user-action](#user-action)  
**Description:** Saving the election package is initiated.  
**Machines:** vx-admin
### save-election-package-complete
**Type:** [user-action](#user-action)  
**Description:** Saving the election package completed, success or failure is indicated by the disposition.  
**Machines:** vx-admin
### smart-card-program-init
**Type:** [user-action](#user-action)  
**Description:** A smart card is being programmed. The new smart card user role is indicated by the programmedUserRole key.  
**Machines:** vx-admin
### smart-card-program-complete
**Type:** [user-action](#user-action)  
**Description:** A smart card has been programmed (or failed to be programmed). The new smart card user role is indicated by the programmedUserRole key.  
**Machines:** vx-admin
### smart-card-unprogram-init
**Type:** [user-action](#user-action)  
**Description:** A smart card is being unprogrammed. The current smart card user role is indicated by the programmedUserRole key.  
**Machines:** vx-admin
### smart-card-unprogram-complete
**Type:** [user-action](#user-action)  
**Description:** A smart card has been unprogrammed (or failed to be unprogrammed). The previous (or current in the case of failure) smart card user role is indicated by the previousProgrammedUserRole key (or programmedUserRole key in the case of failure).  
**Machines:** vx-admin
### list-cast-vote-record-exports-on-usb-drive
**Type:** [user-action](#user-action)  
**Description:** Cast vote record exports on the inserted USB drive were listed.  
**Machines:** vx-admin
### import-cast-vote-records-init
**Type:** [user-action](#user-action)  
**Description:** Cast vote records are being imported from a USB drive.  
**Machines:** vx-admin
### import-cast-vote-records-complete
**Type:** [user-action](#user-action)  
**Description:** Cast vote records have been imported from a USB drive (or failed to be imported).  
**Machines:** vx-admin
### clear-imported-cast-vote-records-init
**Type:** [user-action](#user-action)  
**Description:** Imported cast vote records are being cleared.  
**Machines:** vx-admin
### clear-imported-cast-vote-records-complete
**Type:** [user-action](#user-action)  
**Description:** Imported cast vote records have been cleared (or failed to be cleared).  
**Machines:** vx-admin
### manual-tally-data-edited
**Type:** [user-action](#user-action)  
**Description:** User added or edited manually entered tally data to be included in the results alongside loaded CVR files.  
**Machines:** vx-admin
### manual-tally-data-removed
**Type:** [user-action](#user-action)  
**Description:** User removed manual tally data that was previously entered.  
**Machines:** vx-admin
### election-results-reporting-tally-file-imported
**Type:** [user-action](#user-action)  
**Description:** User imported an Election Results Reporting file with tally data to be included in the results alongside loaded CVR files.  
**Machines:** vx-admin
### marked-tally-results-official
**Type:** [user-action](#user-action)  
**Description:** User marked the tally results as official. This disables loading more CVR files or editing manual tally data.  
**Machines:** vx-admin
### election-report-previewed
**Type:** [user-action](#user-action)  
**Description:** Report previewed by the user.  
**Machines:** vx-admin
### election-report-printed
**Type:** [user-action](#user-action)  
**Description:** Report printed by the user.  
**Machines:** vx-admin
### write-in-adjudicated
**Type:** [user-action](#user-action)  
**Description:** User adjudicated a write-in.  
**Machines:** vx-admin
### clear-ballot-data-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated clearing ballot data in the current application.  
**Machines:** vx-central-scan
### clear-ballot-data-complete
**Type:** [user-action](#user-action)  
**Description:** User has finished clearing ballot data in the given application. Success or failure is indicated by the disposition.  
**Machines:** vx-central-scan
### delete-cvr-batch-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`  
**Machines:** vx-central-scan
### delete-cvr-batch-complete
**Type:** [user-action](#user-action)  
**Description:** User has completed deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`.  
**Machines:** vx-central-scan
### scan-batch-init
**Type:** [user-action](#user-action)  
**Description:** The user has begun scanning a new batch of ballots. Success or failure of beginning the process of scanning indicated by disposition. Batch ID for next scanned batch indicated in batchId.  
**Machines:** vx-central-scan
### scan-sheet-complete
**Type:** [user-action](#user-action)  
**Description:** A single sheet in a batch has completed scanning. Success or failure of the scanning indicated by disposition. Ballots rejected due to being unreadable, configured for the wrong election, needed resolution, etc. marked as `failure`. Current batch specified by `batchId` and sheet in batch specified by `sheetCount`.  
**Machines:** vx-central-scan
### scan-batch-complete
**Type:** [user-action](#user-action)  
**Description:** A batch of scanned sheets has finished scanning. Success or failure indicated by disposition.  
**Machines:** vx-central-scan
### scan-batch-continue
**Type:** [user-action](#user-action)  
**Description:** Scanning continued by user after errors and/or warning stopped scanning. Log will indicate if the sheet was tabulated with warnings, or if the user indicated removing the ballot in order to continue scanning.  
**Machines:** vx-central-scan
### scan-adjudication-info
**Type:** [application-status](#application-status)  
**Description:** Information about a ballot sheet that needs adjudication from the user. The possible unresolvable errors are InvalidTestModePage when a test mode ballot is seen when scanning in live mode or vice versa, InvalidBallotHashPage when a sheet for the wrong election is seen, InvalidPrecinctPage when a sheet for an invalid precinct is seen, UnreadablePage for a sheet that is unrecognizable as either a HMPB or BMD ballot, and BlankPage for a blank sheet. Warnings that the user can choose to tabulate with a ballot include MarginalMark, Overvote, Undervote, and BlankBallot (a ballot where there are no votes for any contest).  
**Machines:** vx-central-scan
### fujitsu-scan-init
**Type:** [application-action](#application-action)  
**Description:** Application is initiating a new scanning batch on the fujitsu scanner.  
**Machines:** vx-central-scan
### fujitsu-scan-sheet-scanned
**Type:** [application-status](#application-status)  
**Description:** A scanned image has returned while scanning from a fujitsu scanner, or an error was seen while scanning. Success or failure indicated by disposition.  
**Machines:** vx-central-scan
### fujitsu-scan-batch-complete
**Type:** [application-status](#application-status)  
**Description:** A batch of sheets has completed scanning on the fujitsu scanner.  
**Machines:** vx-central-scan
### fujitsu-scan-message
**Type:** [application-status](#application-status)  
**Description:** Message from the driver handling the fujitsu scanner regarding scanning progress.  
**Machines:** vx-central-scan
### election-package-load-from-usb-complete
**Type:** [user-action](#user-action)  
**Description:** The election package has been read from the USB drive. Success or failure indicated by disposition.  
**Machines:** vx-central-scan, vx-scan
### export-cast-vote-records-init
**Type:** [user-action](#user-action)  
**Description:** Cast vote records are being exported to a USB drive.  
**Machines:** vx-central-scan, vx-scan
### export-cast-vote-records-complete
**Type:** [user-action](#user-action)  
**Description:** Cast vote records have been exported to a USB drive (or failed to be exported).  
**Machines:** vx-central-scan, vx-scan
### polls-opened
**Type:** [user-action](#user-action)  
**Description:** User has opened the polls.  
**Machines:** vx-mark, vx-scan, vx-mark-scan
### voting-paused
**Type:** [user-action](#user-action)  
**Description:** User has paused voting and polls are now paused.  
**Machines:** vx-mark, vx-scan, vx-mark-scan
### voting-resumed
**Type:** [user-action](#user-action)  
**Description:** User has resumed voting and polls are now open.  
**Machines:** vx-mark, vx-scan, vx-mark-scan
### polls-closed
**Type:** [user-action](#user-action)  
**Description:** User has closed the polls.  
**Machines:** vx-mark, vx-scan, vx-mark-scan
### reset-polls-to-paused
**Type:** [user-action](#user-action)  
**Description:** User has reset the polls from closed to paused.  
**Machines:** vx-mark, vx-scan, vx-mark-scan
### ballot-box-emptied
**Type:** [user-action](#user-action)  
**Description:** Poll worker confirmed that they emptied the ballot box.  
**Machines:** vx-mark-scan
### precinct-configuration-changed
**Type:** [user-action](#user-action)  
**Description:** User has changed the precinct setting.  
**Machines:** vx-mark, vx-scan, vx-mark-scan
### scanner-batch-started
**Type:** [system-action](#system-action)  
**Description:** The precinct scanner has started a new batch.  
**Machines:** vx-scan
### scanner-batch-ended
**Type:** [system-action](#system-action)  
**Description:** The precinct scanner has ended the current batch.  
**Machines:** vx-scan
### scanner-state-machine-event
**Type:** [application-action](#application-action)  
**Description:** Precinct scanner state machine received an event.  
**Machines:** vx-scan
### scanner-state-machine-transition
**Type:** [application-status](#application-status)  
**Description:** Precinct scanner state machine transitioned states.  
**Machines:** vx-scan
### sound-toggled
**Type:** [application-status](#application-status)  
**Description:** Sounds on the precinct scanner were toggled on or off as indicated.  
**Machines:** vx-scan
### double-sheet-toggled
**Type:** [application-status](#application-status)  
**Description:** Double sheet detection toggled on or off as indicated.  
**Machines:** vx-scan
### continuous-export-toggled
**Type:** [application-status](#application-status)  
**Description:** Continuous export paused or resumed as indicated.  
**Machines:** vx-scan
### mark-scan-state-machine-event
**Type:** [system-status](#system-status)  
**Description:** Event fired by the mark-scan state machine.  
**Machines:** vx-mark-scan
### pat-device-error
**Type:** [system-status](#system-status)  
**Description:** VxMark encountered an error with the built-in PAT device port or the device itself  
**Machines:** vx-mark-scan
### paper-handler-state-machine-transition
**Type:** [application-status](#application-status)  
**Description:** Precinct print/scan BMD state machine transitioned states.  
**Machines:** vx-mark-scan
### vote-cast
**Type:** [user-action](#user-action)  
**Description:** Vote was cast on a BMD.  
**Machines:** vx-mark-scan
### ballot-invalidated
**Type:** [user-action](#user-action)  
**Description:** A vote was canceled during verification.  
**Machines:** vx-mark-scan
### poll-worker-confirmed-ballot-removal
**Type:** [user-action](#user-action)  
**Description:** A poll worker confirmed the invalid ballot was removed during ballot invalidation.  
**Machines:** vx-mark-scan
### blank-sheet-interpretation
**Type:** [system-status](#system-status)  
**Description:** Interpretation of a printed ballot was blank.  
**Machines:** vx-mark-scan
### paper-handler-connection
**Type:** [system-status](#system-status)  
**Description:** Connection to paper handler device was resolved.  
**Machines:** vx-mark-scan
### create-virtual-uinput-device-init
**Type:** [system-action](#system-action)  
**Description:** A hardware daemon attempted to create a uinput virtual device.  
**Machines:** vx-mark-scan
### create-virtual-uinput-device-complete
**Type:** [system-action](#system-action)  
**Description:** A hardware daemon finished creating a uinput virtual device.  
**Machines:** vx-mark-scan
### connect-to-gpio-pin-init
**Type:** [system-action](#system-action)  
**Description:** mark-scan PAT daemon initiated connection a specific GPIO pin.  
**Machines:** vx-mark-scan
### connect-to-gpio-pin-complete
**Type:** [system-action](#system-action)  
**Description:** mark-scan PAT daemon completed connection a specific GPIO pin.  
**Machines:** vx-mark-scan
### connect-to-pat-input-init
**Type:** [system-action](#system-action)  
**Description:** mark-scan PAT daemon initiated connection to the PAT device input.  
**Machines:** vx-mark-scan
### connect-to-pat-input-complete
**Type:** [system-action](#system-action)  
**Description:** mark-scan PAT daemon completed connection to the PAT device input.  
**Machines:** vx-mark-scan
### controller-connection-init
**Type:** [system-action](#system-action)  
**Description:** mark-scan controller daemon initiated connection to the accessible controller.  
**Machines:** vx-mark-scan
### controller-connection-complete
**Type:** [system-action](#system-action)  
**Description:** mark-scan controller daemon completed connection to the accessible controller.  
**Machines:** vx-mark-scan
### controller-handshake-init
**Type:** [system-action](#system-action)  
**Description:** mark-scan controller daemon initiated handshake with controller.  
**Machines:** vx-mark-scan
### controller-handshake-complete
**Type:** [system-action](#system-action)  
**Description:** mark-scan controller daemon received handshake response from controller.  
**Machines:** vx-mark-scan
### error-setting-sigint-handler
**Type:** [system-status](#system-status)  
**Description:** mark-scan controller daemon encountered an error when setting SIGINT handler.  
**Machines:** vx-mark-scan
### unexpected-hardware-device-response
**Type:** [system-status](#system-status)  
**Description:** A connected hardware device returned an unexpected response.  
**Machines:** vx-mark-scan
### no-pid
**Type:** [system-status](#system-status)  
**Description:** No PID was readable from PID file, or PID file did not exist.  
**Machines:** vx-mark-scan
### signed-hash-validation-init
**Type:** [user-action](#user-action)  
**Description:** Initiating signed hash validation.  
**Machines:** All
### signed-hash-validation-complete
**Type:** [user-action](#user-action)  
**Description:** Signed hash validation completed. Success or failure indicated by disposition.  
**Machines:** All