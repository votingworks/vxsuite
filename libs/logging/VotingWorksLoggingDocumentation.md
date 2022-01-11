
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
### admin-authentication-2fac
**Type:** [user-action](#user-action)  
**Description:** Attempt to authenticate an admin user session with a passcode.  
**Machines:** All
### machine-locked
**Type:** [user-action](#user-action)  
**Description:** The current user was logged out and the machine was locked.  
**Machines:** All
### admin-card-inserted
**Type:** [user-action](#user-action)  
**Description:** Admin smartcard inserted, the user will be prompted for passcode to complete authentication.  
**Machines:** All
### user-session-activation
**Type:** [user-action](#user-action)  
**Description:** A user attempted to authenticate as a new user role, disposition and message clarify the user roles and success/failure.  
**Machines:** All
### user-logged-out
**Type:** [user-action](#user-action)  
**Description:** User logged out of the current session.  
**Machines:** All
### usb-drive-status-update
**Type:** [application-status](#application-status)  
**Description:** USB Drive detected a status update. Potential USB statuses are: notavailable - No USB Drive detection is available, absent - No USB identified, present - USB identified but not mounted, mounted - USB mounted on device, ejecting - USB in the process of ejecting.   
**Machines:** All
### usb-drive-eject-init
**Type:** [user-action](#user-action)  
**Description:** A request to eject the current USB drive was given by the user, the usb drive will now be ejected.  
**Machines:** All
### usb-drive-eject-complete
**Type:** [application-status](#application-status)  
**Description:** The current USB drive finished attempting to ejected. Success or failure indicated by disposition.  
**Machines:** All
### usb-drive-mount-init
**Type:** [application-action](#application-action)  
**Description:** The USB Drive is attempting to mount. This action is taken automatically by the application when a new USB drive is detected.  
**Machines:** All
### usb-drive-mount-complete
**Type:** [application-status](#application-status)  
**Description:** USB Drive mount has completed. Success or failure is indicated by the disposition.  
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
**Description:** A piece of information (current election, imported CVR files, etc.) is loaded from storage. May happen as an automated action when an application starts up, or as a result of a user action.  
**Machines:** All
### save-to-storage
**Type:** [user-action](#user-action)  
**Description:** A piece of information is saved to storage, usually resulting from a user action for example a user importing CVR files results in those files being saved to storage.  
**Machines:** All
### file-saved
**Type:** [user-action](#user-action)  
**Description:** File is saved to a USB drive. Success or failure indicated by disposition. Type of file specified with "fileType" key. For success logs the saved filename specified with "filename" key.  
**Machines:** All
### export-ballot-package-init
**Type:** [user-action](#user-action)  
**Description:** Exporting the ballot package is initiated.  
**Machines:** vx-admin-frontend
### export-ballot-package-complete
**Type:** [user-action](#user-action)  
**Description:** Exporting the ballot package completed, success or failure is indicated by the disposition.  
**Machines:** vx-admin-frontend
### ballot-printed
**Type:** [user-action](#user-action)  
**Description:** One or more copies of a ballot were printed. Success or failure indicated by the disposition. Precinct, ballot style, ballot type, number of copies and other details included in log data.  
**Machines:** vx-admin-frontend
### printed-ballot-report-printed
**Type:** [user-action](#user-action)  
**Description:** Report of all printed ballots was printed. Success or failure indicated by the disposition.  
**Machines:** vx-admin-frontend
### smartcard-program-init
**Type:** [user-action](#user-action)  
**Description:** A write to smartcard is being initiated.  
**Machines:** vx-admin-frontend
### smartcard-programmed
**Type:** [user-action](#user-action)  
**Description:** Smartcard is programmed for a new user type. User type is indicated by the programmedUser key. Success or failure is indicated by the disposition.  
**Machines:** vx-admin-frontend
### smartcard-programmed-override-write-protection
**Type:** [user-action](#user-action)  
**Description:** Smartcard is programmed to override a flag protecting writes on the card. By default admin cards can not be written unless write protection is first overridden.  
**Machines:** vx-admin-frontend
### cvr-imported
**Type:** [user-action](#user-action)  
**Description:** User imported CVR to the machine. Success or failure indicated by disposition.  
**Machines:** vx-admin-frontend
### cvr-files-read-from-usb
**Type:** [user-action](#user-action)  
**Description:** User opened import CVR modal and usb is searched for possible CVR files to import.  
**Machines:** vx-admin-frontend
### recompute-tally-init
**Type:** [user-action](#user-action)  
**Description:** New cast vote record files seen, initiating recomputation of tally data.  
**Machines:** vx-admin-frontend
### recompute-tally-complete
**Type:** [user-action](#user-action)  
**Description:** Tally recomputed with new cast vote record files, success or failure indicated by disposition.  
**Machines:** vx-admin-frontend
### external-tally-file-imported
**Type:** [user-action](#user-action)  
**Description:** User imported external tally file to the machine. File type indicated by fileType key. Success or failure indicated by disposition.  
**Machines:** vx-admin-frontend
### manual-tally-data-edited
**Type:** [user-action](#user-action)  
**Description:** User added or edited manually entered tally data to be included alongside imported Cvr files.  
**Machines:** vx-admin-frontend
### marked-tally-results-official
**Type:** [user-action](#user-action)  
**Description:** User marked the tally results as official. This disabled importing any more cvr or other tally data files.  
**Machines:** vx-admin-frontend
### removed-tally-file
**Type:** [user-action](#user-action)  
**Description:** The user removed Cvr, External Tally data, manually entered tally data, or all tally data. The type of file removed specified by the filetype key.  
**Machines:** vx-admin-frontend
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
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### clear-ballot-data-complete
**Type:** [user-action](#user-action)  
**Description:** User has finished clearing ballot data in the given application. Success or failure is indicated by the disposition.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### override-mark-threshold-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated overriding the thresholds of when to count marks seen by the scanning module. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### override-mark-thresholds-complete
**Type:** [user-action](#user-action)  
**Description:** User has finished overriding the thresholds of when to count marks seen by the scanning module. Success or failure is indicated by the disposition. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### download-backup-scan-images
**Type:** [user-action](#user-action)  
**Description:** User downloaded a backup file of the scanned ballot image files and CVRs. Success or failure indicated by disposition.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### configure-from-ballot-package-init
**Type:** [user-action](#user-action)  
**Description:** User had initiated configuring the machine from a ballot package. The ballot package will be loaded from the USB drive, each ballot will be configured, the scanner will be configured, and then the election configuration will be complete.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### ballot-package-files-read-from-usb
**Type:** [user-action](#user-action)  
**Description:** List of ballot packages read from usb and displayed to user to import to machine.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### ballot-package-load-from-usb-complete
**Type:** [user-action](#user-action)  
**Description:** The ballot package has been read from the USB drive. Success or failure indicated by disposition.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### ballot-configure-machine-complete
**Type:** [user-action](#user-action)  
**Description:** The specified ballot has been configured on the machine. Success or failure indicated by disposition. `ballotStyleId`, `precinctId` and `isLiveMode` keys specify details on the ballot configured.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### scanner-configure-complete
**Type:** [user-action](#user-action)  
**Description:** The final configuration steps for the scanner for the ballot package have completed. Success or failure indicated by disposition.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### export-cvr-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated exporting CVR file to the USB drive.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### export-cvr-complete
**Type:** [user-action](#user-action)  
**Description:** User has finished exporting a CVR file of all results to the USB drive. Success or failure indicated by disposition. On success, number of ballots included in CVR specified by `numberOfBallots`.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### delete-cvr-batch-init
**Type:** [user-action](#user-action)  
**Description:** User has initiated deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`  
**Machines:** vx-batch-scan-frontend
### delete-cvr-batch-complete
**Type:** [user-action](#user-action)  
**Description:** User has completed deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`.  
**Machines:** vx-batch-scan-frontend
### scan-batch-init
**Type:** [user-action](#user-action)  
**Description:** The user has begun scanning a new batch of ballots. Success or failure of beginning the process of scanning indicated by disposition. Batch ID for next scanned batch indicated in batchId.  
**Machines:** vx-batch-scan-frontend
### scan-sheet-complete
**Type:** [user-action](#user-action)  
**Description:** A single sheet in a batch has completed scanning. Success or failure of the scanning indicated by disposition. Ballots rejected due to being unreadable, configured for the wrong election, needed resolution, etc. marked as `failure`. Current batch specified by `batchId` and sheet in batch specified by `sheetCount`.  
**Machines:** vx-batch-scan-frontend
### scan-batch-complete
**Type:** [user-action](#user-action)  
**Description:** A batch of scanned sheets has finished scanning. Success or failure indicated by disposition.  
**Machines:** vx-batch-scan-frontend
### scan-batch-continue
**Type:** [user-action](#user-action)  
**Description:** Scanning continued by user after errors and/or warning stopped scanning. Log will indicate if the sheet was tabulated with warnings, or if the user indicated removing the ballot in order to continue scanning.  
**Machines:** vx-batch-scan-frontend
### scan-adjudication-info
**Type:** [application-status](#application-status)  
**Description:** Information about a ballot sheet that needs adjudication from the user. The possible unresolvable errors are InvalidTestModePage when a test mode ballot is seen when scanning in live mode or vice versa, InvalidElectionHashPage when a sheet for the wrong election is seen, InvalidPrecinctPage when a sheet for an invalid precinct is seen, UninterpretedHmpbPage for a HMPB ballot that could not be read properly, UnreadablePage for a sheet that is unrecognizable as either a HMPB or BMD ballot, and BlankPage for a blank sheet. Warnings that the user can choose to tabulate with a ballot include MarginalMark, Overvote, Undervote, WriteIn, UnmarkedWriteIn, and BlankBallot (a ballot where there are no votes for any contest).  
**Machines:** vx-batch-scan-frontend
### scanner-config-reloaded
**Type:** [application-status](#application-status)  
**Description:** Configuration information for the machine including the election, if the machine is in test mode, and mark threshold override values were reloaded from the backend service storing this information.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### export-log-file-found
**Type:** [application-status](#application-status)  
**Description:** When the user is exporting logs, indicates the success/failure of finding the expected log file on the machine.  
**Machines:** All
### scan-service-config
**Type:** [application-status](#application-status)  
**Description:** Message from the scanning service about how it is configured while starting up.  
**Machines:** vx-batch-scan-frontend, vx-precinct-scan-frontend
### fujitsu-scan-init
**Type:** [application-action](#application-action)  
**Description:** Application is initiating a new scanning batch on the fujitsu scanner.  
**Machines:** vx-batch-scan-frontend
### fujitsu-scan-sheet-scanned
**Type:** [application-status](#application-status)  
**Description:** A scanned image has returned while scanning from a fujitsu scanner, or an error was seen while scanning. Success or failure indicated by disposition.  
**Machines:** vx-batch-scan-frontend
### fujitsu-scan-batch-complete
**Type:** [application-status](#application-status)  
**Description:** A batch of sheets has completed scanning on the fujitsu scanner.  
**Machines:** vx-batch-scan-frontend
### fujitsu-scan-message
**Type:** [application-status](#application-status)  
**Description:** Message from the driver handling the fujitsu scanner regarding scanning progress.  
**Machines:** vx-batch-scan-frontend
### convert-log-cdf-complete
**Type:** [user-action](#user-action)  
**Description:** The user has converted the log file to a CDF format for export. Success or failure indicated by disposition.  
**Machines:** All
### convert-log-cdf-log-line-error
**Type:** [user-action](#user-action)  
**Description:** Error seen when converting a single log to the CDF format. This log line will be skipped. Disposition of this log is always failure.  
**Machines:** All