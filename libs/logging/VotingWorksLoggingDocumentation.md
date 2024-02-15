
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
### process-started
**Type:** [system-action](#system-action)  
**Description:** A VotingWorks-authored process (eg. hardware daemon) has been started.  
**Machines:** vx-mark-scan-controller-daemon, vx-mark-scan-pat-daemon
### process-terminated
**Type:** [system-action](#system-action)  
**Description:** A VotingWorks-authored process (eg. hardware daemon) has been terminated.  
**Machines:** vx-mark-scan-controller-daemon, vx-mark-scan-pat-daemon
### auth-pin-entry
**Type:** [user-action](#user-action)  
**Description:** A user entered a PIN to log in.  
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
### usb-drive-detected
**Type:** [application-status](#application-status)  
**Description:** A USB drive was detected.  
**Machines:** All
### usb-drive-removed
**Type:** [user-action](#user-action)  
**Description:** A USB drive was removed by the user.  
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
### printer-connection-update
**Type:** [application-status](#application-status)  
**Description:** Application saw a change to the connection status of a given configured printer.  
**Machines:** All
### device-attached
**Type:** [application-status](#application-status)  
**Description:** Application saw a device attached to the system.  
**Machines:** All
### device-unattached
**Type:** [application-status](#application-status)  
**Description:** Application saw a device unattached from the system.  
**Machines:** All
### load-from-storage
**Type:** [application-action](#application-action)  
**Description:** A piece of information (current election, loaded CVR files, etc.) is loaded from storage. May happen as an automated action when an application starts up, or as a result of a user action.  
**Machines:** All
### save-to-storage
**Type:** [user-action](#user-action)  
**Description:** A piece of information is saved to storage, usually resulting from a user action for example a user loading CVR files results in those files being saved to storage.  
**Machines:** All
### file-saved
**Type:** [user-action](#user-action)  
**Description:** File is saved to a USB drive. Success or failure indicated by disposition. Type of file specified with "fileType" key. For success logs the saved filename specified with "filename" key.  
**Machines:** All
### save-election-package-init
**Type:** [user-action](#user-action)  
**Description:** Saving the election package is initiated.  
**Machines:** vx-admin-frontend
### save-election-package-complete
**Type:** [user-action](#user-action)  
**Description:** Saving the election package completed, success or failure is indicated by the disposition.  
**Machines:** vx-admin-frontend
### smart-card-program-init
**Type:** [user-action](#user-action)  
**Description:** A smart card is being programmed. The new smart card user role is indicated by the programmedUserRole key.  
**Machines:** vx-admin-service
### smart-card-program-complete
**Type:** [user-action](#user-action)  
**Description:** A smart card has been programmed (or failed to be programmed). The new smart card user role is indicated by the programmedUserRole key.  
**Machines:** vx-admin-service
### smart-card-unprogram-init
**Type:** [user-action](#user-action)  
**Description:** A smart card is being unprogrammed. The current smart card user role is indicated by the programmedUserRole key.  
**Machines:** vx-admin-service
### smart-card-unprogram-complete
**Type:** [user-action](#user-action)  
**Description:** A smart card has been unprogrammed (or failed to be unprogrammed). The previous (or current in the case of failure) smart card user role is indicated by the previousProgrammedUserRole key (or programmedUserRole key in the case of failure).  
**Machines:** vx-admin-service
### list-cast-vote-record-exports-on-usb-drive
**Type:** [user-action](#user-action)  
**Description:** Cast vote record exports on the inserted USB drive were listed.  
**Machines:** vx-admin-service
### import-cast-vote-records-init
**Type:** [user-action](#user-action)  
**Description:** Cast vote records are being imported from a USB drive.  
**Machines:** vx-admin-service
### import-cast-vote-records-complete
**Type:** [user-action](#user-action)  
**Description:** Cast vote records have been imported from a USB drive (or failed to be imported).  
**Machines:** vx-admin-service
### clear-imported-cast-vote-records-init
**Type:** [user-action](#user-action)  
**Description:** Imported cast vote records are being cleared.  
**Machines:** vx-admin-service
### clear-imported-cast-vote-records-complete
**Type:** [user-action](#user-action)  
**Description:** Imported cast vote records have been cleared (or failed to be cleared).  
**Machines:** vx-admin-service
### recompute-tally-init
**Type:** [user-action](#user-action)  
**Description:** New cast vote record files seen, initiating recomputation of tally data.  
**Machines:** vx-admin-frontend
### recompute-tally-complete
**Type:** [user-action](#user-action)  
**Description:** Tally recomputed with new cast vote record files, success or failure indicated by disposition.  
**Machines:** vx-admin-frontend
### manual-tally-data-edited
**Type:** [user-action](#user-action)  
**Description:** User added or edited manually entered tally data to be included in the results alongside loaded CVR files.  
**Machines:** vx-admin-service
### manual-tally-data-removed
**Type:** [user-action](#user-action)  
**Description:** User removed manual tally data that was previously entered.  
**Machines:** vx-admin-service
### marked-tally-results-official
**Type:** [user-action](#user-action)  
**Description:** User marked the tally results as official. This disables loading more CVR files or editing manual tally data.  
**Machines:** vx-admin-service
### tally-report-previewed
**Type:** [user-action](#user-action)  
**Description:** Tally Report previewed and viewed in the app.  
**Machines:** vx-admin-frontend
### tally-report-printed
**Type:** [user-action](#user-action)  
**Description:** Tally Report printed.  
**Machines:** vx-admin-frontend
### converting-to-sems
**Type:** [user-action](#user-action)  
**Description:** Initiating conversion of tally results to SEMS file format.  
**Machines:** vx-admin-frontend
### test-deck-printed
**Type:** [user-action](#user-action)  
**Description:** User printed the test deck. Success or failure indicated by disposition.  
**Machines:** vx-admin-frontend
### test-deck-tally-report-printed
**Type:** [user-action](#user-action)  
**Description:** User printed the test deck tally report. Success or failure indicated by disposition.  
**Machines:** vx-admin-frontend
### test-deck-tally-report-saved-to-pdf
**Type:** [user-action](#user-action)  
**Description:** User attempted to save the test deck tally report as PDF. Success or failure indicated by subsequent FileSaved log disposition.  
**Machines:** vx-admin-frontend
### initial-election-package-loaded
**Type:** [user-action](#user-action)  
**Description:** User loaded VxAdmin initial election package  
**Machines:** vx-admin-frontend
### system-settings-save-initiated
**Type:** [application-status](#application-status)  
**Description:** VxAdmin attempting to save System Settings to db  
**Machines:** vx-admin-service
### system-settings-saved
**Type:** [application-status](#application-status)  
**Description:** VxAdmin System Settings saved to db  
**Machines:** vx-admin-service
### system-settings-retrieved
**Type:** [application-status](#application-status)  
**Description:** VxAdmin System Settings read from db  
**Machines:** vx-admin-service
### write-in-adjudicated
**Type:** [user-action](#user-action)  
**Description:** User adjudicated a write-in.  
**Machines:** vx-admin-service
### toggle-test-mode-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated toggling between test mode and live mode in the current application.  
**Machines:** All
### toggled-test-mode
**Type:** [user-action](#user-action)  
**Description:** User has finished toggling between live mode and test mode in the given application. Success or failure is indicated by the disposition.  
**Machines:** All
### clear-ballot-data-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated clearing ballot data in the current application.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### clear-ballot-data-complete
**Type:** [user-action](#user-action)  
**Description:** User has finished clearing ballot data in the given application. Success or failure is indicated by the disposition.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### override-mark-threshold-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated overriding the thresholds of when to count marks seen by the scanning module. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### override-mark-thresholds-complete
**Type:** [user-action](#user-action)  
**Description:** User has finished overriding the thresholds of when to count marks seen by the scanning module. Success or failure is indicated by the disposition. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### saved-scan-image-backup
**Type:** [user-action](#user-action)  
**Description:** User saved a backup file of the scanned ballot image files and CVRs. Success or failure indicated by disposition.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### configure-from-election-package-init
**Type:** [user-action](#user-action)  
**Description:** User had initiated configuring the machine from an election package. The election package will be loaded from the USB drive, each ballot will be configured, the scanner will be configured, and then the election configuration will be complete.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### election-package-files-read-from-usb
**Type:** [user-action](#user-action)  
**Description:** List of election packages read from usb and displayed to user to load to machine.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### ballot-configure-machine-complete
**Type:** [user-action](#user-action)  
**Description:** The specified ballot has been configured on the machine. Success or failure indicated by disposition. `ballotStyleId`, `precinctId` and `isLiveMode` keys specify details on the ballot configured.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### scanner-configure-complete
**Type:** [user-action](#user-action)  
**Description:** The final configuration steps for the scanner for the election package have completed. Success or failure indicated by disposition.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### delete-cvr-batch-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`  
**Machines:** vx-central-scan-frontend
### delete-cvr-batch-complete
**Type:** [user-action](#user-action)  
**Description:** User has completed deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`.  
**Machines:** vx-central-scan-frontend
### scan-batch-init
**Type:** [user-action](#user-action)  
**Description:** The user has begun scanning a new batch of ballots. Success or failure of beginning the process of scanning indicated by disposition. Batch ID for next scanned batch indicated in batchId.  
**Machines:** vx-central-scan-frontend
### scan-sheet-complete
**Type:** [user-action](#user-action)  
**Description:** A single sheet in a batch has completed scanning. Success or failure of the scanning indicated by disposition. Ballots rejected due to being unreadable, configured for the wrong election, needed resolution, etc. marked as `failure`. Current batch specified by `batchId` and sheet in batch specified by `sheetCount`.  
**Machines:** vx-central-scan-frontend
### scan-batch-complete
**Type:** [user-action](#user-action)  
**Description:** A batch of scanned sheets has finished scanning. Success or failure indicated by disposition.  
**Machines:** vx-central-scan-frontend
### scan-batch-continue
**Type:** [user-action](#user-action)  
**Description:** Scanning continued by user after errors and/or warning stopped scanning. Log will indicate if the sheet was tabulated with warnings, or if the user indicated removing the ballot in order to continue scanning.  
**Machines:** vx-central-scan-frontend
### scan-adjudication-info
**Type:** [application-status](#application-status)  
**Description:** Information about a ballot sheet that needs adjudication from the user. The possible unresolvable errors are InvalidTestModePage when a test mode ballot is seen when scanning in live mode or vice versa, InvalidElectionHashPage when a sheet for the wrong election is seen, InvalidPrecinctPage when a sheet for an invalid precinct is seen, UnreadablePage for a sheet that is unrecognizable as either a HMPB or BMD ballot, and BlankPage for a blank sheet. Warnings that the user can choose to tabulate with a ballot include MarginalMark, Overvote, Undervote, and BlankBallot (a ballot where there are no votes for any contest).  
**Machines:** vx-central-scan-frontend
### scanner-config-reloaded
**Type:** [application-status](#application-status)  
**Description:** Configuration information for the machine including the election, if the machine is in test mode, and mark threshold override values were reloaded from the backend service storing this information.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### save-log-file-found
**Type:** [application-status](#application-status)  
**Description:** When the user is saving logs, indicates the success/failure of finding the expected log file on the machine.  
**Machines:** All
### scan-service-config
**Type:** [application-status](#application-status)  
**Description:** Message from the scanning service about how it is configured while starting up.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### admin-service-config
**Type:** [application-status](#application-status)  
**Description:** Message from the admin service about how it is configured while starting up.  
**Machines:** vx-admin-frontend
### fujitsu-scan-init
**Type:** [application-action](#application-action)  
**Description:** Application is initiating a new scanning batch on the fujitsu scanner.  
**Machines:** vx-central-scan-frontend
### fujitsu-scan-sheet-scanned
**Type:** [application-status](#application-status)  
**Description:** A scanned image has returned while scanning from a fujitsu scanner, or an error was seen while scanning. Success or failure indicated by disposition.  
**Machines:** vx-central-scan-frontend
### fujitsu-scan-batch-complete
**Type:** [application-status](#application-status)  
**Description:** A batch of sheets has completed scanning on the fujitsu scanner.  
**Machines:** vx-central-scan-frontend
### fujitsu-scan-message
**Type:** [application-status](#application-status)  
**Description:** Message from the driver handling the fujitsu scanner regarding scanning progress.  
**Machines:** vx-central-scan-frontend
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
### election-package-load-from-usb-complete
**Type:** [user-action](#user-action)  
**Description:** The election package has been read from the USB drive. Success or failure indicated by disposition.  
**Machines:** vx-central-scan-frontend, vx-scan-frontend
### export-cast-vote-records-init
**Type:** [user-action](#user-action)  
**Description:** Cast vote records are being exported to a USB drive.  
**Machines:** vx-central-scan-service, vx-scan-backend
### export-cast-vote-records-complete
**Type:** [user-action](#user-action)  
**Description:** Cast vote records have been exported to a USB drive (or failed to be exported).  
**Machines:** vx-central-scan-service, vx-scan-backend
### polls-opened
**Type:** [user-action](#user-action)  
**Description:** User has opened the polls.  
**Machines:** vx-mark-frontend, vx-scan-frontend
### voting-paused
**Type:** [user-action](#user-action)  
**Description:** User has paused voting and polls are now paused.  
**Machines:** vx-mark-frontend, vx-scan-frontend
### voting-resumed
**Type:** [user-action](#user-action)  
**Description:** User has resumed voting and polls are now open.  
**Machines:** vx-mark-frontend, vx-scan-frontend
### polls-closed
**Type:** [user-action](#user-action)  
**Description:** User has closed the polls.  
**Machines:** vx-mark-frontend, vx-scan-frontend
### reset-polls-to-paused
**Type:** [user-action](#user-action)  
**Description:** User has reset the polls from closed to paused.  
**Machines:** vx-mark-frontend, vx-scan-frontend
### ballot-bag-replaced
**Type:** [user-action](#user-action)  
**Description:** User confirmed that they replaced the ballot bag.  
**Machines:** vx-scan-frontend
### ballot-box-emptied
**Type:** [user-action](#user-action)  
**Description:** Poll worker confirmed that they emptied the ballot box.  
**Machines:** vx-mark-scan-frontend
### tally-report-cleared-from-card
**Type:** [application-action](#application-action)  
**Description:** The tally report has been cleared from the poll worker card.  
**Machines:** vx-mark-frontend
### precinct-configuration-changed
**Type:** [user-action](#user-action)  
**Description:** User has changed the precinct setting.  
**Machines:** vx-mark-frontend, vx-scan-frontend
### scanner-batch-started
**Type:** [system-action](#system-action)  
**Description:** The precinct scanner has started a new batch, either because the polls were opened or the ballot bag was replaced.  
**Machines:** vx-scan-backend
### scanner-batch-ended
**Type:** [system-action](#system-action)  
**Description:** The precinct scanner has ended the current batch, either because the polls were closed (or paused) or the ballot bag was replaced.  
**Machines:** vx-scan-backend
### scanner-state-machine-event
**Type:** [application-action](#application-action)  
**Description:** Precinct scanner state machine received an event.  
**Machines:** vx-scan-backend
### scanner-state-machine-transition
**Type:** [application-status](#application-status)  
**Description:** Precinct scanner state machine transitioned states.  
**Machines:** vx-scan-backend
### pat-device-error
**Type:** [system-status](#system-status)  
**Description:** VxMarkScan encountered an error with the built-in PAT device port or the device itself  
**Machines:** vx-mark-scan-backend
### paper-handler-state-machine-transition
**Type:** [application-status](#application-status)  
**Description:** Precinct print/scan BMD state machine transitioned states.  
**Machines:** vx-mark-scan-backend
### vote-cast
**Type:** [user-action](#user-action)  
**Description:** Vote was cast on a BMD.  
**Machines:** vx-mark-scan-backend
### ballot-invalidated
**Type:** [user-action](#user-action)  
**Description:** A vote was canceled during verification.  
**Machines:** vx-mark-scan-backend
### poll-worker-confirmed-ballot-removal
**Type:** [user-action](#user-action)  
**Description:** A poll worker confirmed the invalid ballot was removed during ballot invalidation.  
**Machines:** vx-mark-scan-frontend
### blank-sheet-interpretation
**Type:** [system-status](#system-status)  
**Description:** Interpretation of a printed ballot was blank.  
**Machines:** vx-mark-scan-backend
### paper-handler-connection
**Type:** [system-status](#system-status)  
**Description:** Connection to paper handler device was resolved.  
**Machines:** vx-mark-scan-backend
### create-virtual-uinput-device-init
**Type:** [system-action](#system-action)  
**Description:** A hardware daemon attempted to create a uinput virtual device.  
**Machines:** vx-mark-scan-pat-daemon, vx-mark-scan-controller-daemon
### create-virtual-uinput-device-complete
**Type:** [system-action](#system-action)  
**Description:** A hardware daemon finished creating a uinput virtual device.  
**Machines:** vx-mark-scan-pat-daemon, vx-mark-scan-controller-daemon
### connect-to-pat-input-init
**Type:** [system-action](#system-action)  
**Description:** mark-scan PAT daemon initiated connection to the PAT device input.  
**Machines:** vx-mark-scan-pat-daemon
### connect-to-pat-input-complete
**Type:** [system-action](#system-action)  
**Description:** mark-scan PAT daemon completed connection to the PAT device input.  
**Machines:** vx-mark-scan-pat-daemon
### controller-connection-init
**Type:** [system-action](#system-action)  
**Description:** mark-scan controller daemon initiated connection to the accessible controller.  
**Machines:** vx-mark-scan-controller-daemon
### controller-connection-complete
**Type:** [system-action](#system-action)  
**Description:** mark-scan controller daemon completed connection to the accessible controller.  
**Machines:** vx-mark-scan-controller-daemon
### controller-handshake-init
**Type:** [system-action](#system-action)  
**Description:** mark-scan controller daemon initiated handshake with controller.  
**Machines:** vx-mark-scan-controller-daemon
### controller-handshake-complete
**Type:** [system-action](#system-action)  
**Description:** mark-scan controller daemon received handshake response from controller.  
**Machines:** vx-mark-scan-controller-daemon
### error-setting-sigint-handler
**Type:** [system-status](#system-status)  
**Description:** mark-scan controller daemon encountered an error when setting SIGINT handler.  
**Machines:** vx-mark-scan-controller-daemon
### unexpected-hardware-device-response
**Type:** [system-status](#system-status)  
**Description:** A connected hardware device returned an unexpected response.  
**Machines:** vx-mark-scan-pat-daemon
### unknown-error
**Type:** [application-status](#application-status)  
**Description:** Machine encountered an unknown error.  
**Machines:** vx-admin-frontend, vx-central-scan-frontend, vx-mark-frontend, vx-mark-scan-frontend, vx-mark-scan-pat-daemon, vx-mark-scan-controller-daemon, vx-scan-frontend