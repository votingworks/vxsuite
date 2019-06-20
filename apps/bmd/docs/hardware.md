# Setting up BMD Hardware

## Equipment

- BMD laptop – Dell Latitude 3390 2-in-one
- BMD printer – Brother HL-L2300D Monochrome Laser Printer with Duplex Printing
- USB cable to connect laptop and printer: A-male to B-male
- Barcode scanner and associated USB cable
- BMD Activation Code printed out.
- standard headphones with 3.5mm jack

## Configure Brand New Windows Laptop

Windows on Dell Latitude 3390 2-in-1 laptop.

### Basic setup

1. Computer basics:

- Turn on computer.
- Answer basic questions about region and keyboard layout.
- Connect to wifi.
- Allow it to install updates.

1. Select: "Set up for personal use".
1. On the "Sign in with Microsoft" screen, select "Offline account", and then
   confirm that you do not want to sign in with Microsoft.
1. On the "Who’s going to use this PC?" screen, enter: VotingWorks
1. On the "Create a super memorable password" screen, enter a password of your
   choice and then enter the password again to confirm.
1. On the "Add a hint for your password" screen, enter a hint of your choice
1. On the "Use your face to sign in faster and more securely" screen, click
   "Skip for now".
1. On the "Make Cortana your personal assistant?" screen, click "No".
1. On the "Choose privacy settings for your device" screen, disable all privacy
   options: Location, Diagnostics, Relevant Ads, Speech recognition, Tailored
   experiences with diagnostic data, etc. Then click "Accept".
1. You should now be at the desktop of the computer.
1. Click the windows icon in the lower left.
1. Click the gear (Settings)
1. Click "Accounts"
1. Click "Sign-in options"
1. Under "Require sign-in" select "Never"
1. Go back to Settings home
1. Click "System", then click "Display"
1. Change the "Scale and layout" setting to 100%
1. Close the Settings window.
1. In the search box (bottom left), type "netplwiz" and then click "netplwiz Run
   command".
1. In the window that appears, uncheck "Users must enter a user name and
   password to use this computer"
1. Click "Apply", then in the modal that appears, enter user name and password
   of the default user set up earlier. Then click "OK".
1. Click "OK" to close the window.

### Install Chrome

1. Open Microsoft Edge (or Explorer) and go to https://www.google.com/chrome.
1. Click Download Chrome.
1. Uncheck option to "Help make Google Chrome better…"
1. Click Accept and Install and then click Run to install Chrome.
1. "Do you want to allow this app to make changes to your device?" Click Yes.
1. Chrome will download, install, and open.
1. Quit Edge

### Configure Chrome Service Workers

1. In Chrome browser, go to https://bmd.votingworks.app.
1. In the top-right menu marked with three vertical dots ︙ (or the "Customize
   and control Google Chrome" menu), select "More tools", then "Developer
   tools". A sidebar will open.
1. Select the "Application" tab. (It may not be visible, you may only see
   Elements, Console, Sources... If so, click the >> arrow, and you'll see a
   dropdown with "Application" as one option. Click it.)
1. Click "Service Workers", then check the box "Update on reload"
1. Close the developer tools by clicking the "✕" in the upper right hand corner
   of the sidebar (below the Google Chrome menu you first opened up before the
   sidebar opened.)

## Setup ChromeVox

Be aware as soon as this extension is installed it will begin to speak the
interface.

_To disable the audio_, press shortcut Shift-Alt-A (as one), then A again. To
enable, use the same command.

1. Install the ChromeVox extension from the Chrome Web Store.
1. In Chrome browser, search for "ChromeVox extension" or go to
   https://chrome.google.com/webstore/detail/chromevox/kgejglhpjiefppelpmljglcjbhoiplfn?hl=en
1. Click "Add to Chrome", then "Add extension" in the confirmation modal.
1. Close Chrome
1. Open the VotingWorks shortcut and confirm that ChromeVox is working.

## Install BMD in Kiosk Mode

Install BMD as PWA (Progressive Web App) in kiosk mode.

1. In the top-right menu marked with three vertical dots ︙ (or the "Customize
   and control Google Chrome" menu), click on the item "Install VotingWorks
   Ballot Marking Device…".
1. In the modal that appears, click "Install". This will place a VotingWorks
   Ballot Marking Device shortcut on the desktop.
1. Close/Quit Google Chrome.
1. Right-click the shortcut, and select "Properties" in the menu.
1. In the Properties window that appears, select the "Shortcut" tab.
1. Under "Target" there is a string. Append the following to the end of the
   string: " --kiosk --kiosk-printing --disable-pinch
   --overscroll-history-navigation=0"
1. Click "Apply" then "OK"

## Launch and Exit BMD in Kiosk Mode

Use the desktop shortcut to launch the BMD in kiosk mode.

Use the keyboard shortcut Alt+F4 (or Ctrl+W) to exit kiosk mode.

## Update BMD to Latest Version (as necessary)

1. Close the VotingWorks BMD App with shortcut: Alt+F4.
1. Launch Chrome, and go to https://bmd.votingworks.app.
1. If on the "Scan Activation Code" page, click the QR code, then use shortcut:
   Ctrl-K to get to the "Configure Ballot Marking Device" screen.
1. Force reload the app with the shortcut: Shift-Ctrl-R.
1. Configure the BMD with the election.json file.
1. Close Google Chrome.
1. Launch the BMD, using the desktop shortcut: VotingWorks Ballot Marking
   Device.

## Setup and Install Brother HL-L2300D Printer

1. Unpack printer, load the toner cartridge, load paper, plug in, turn on
1. Open browser, go to random web page, and select print (or Ctrl-P).
1. Select "Destination" to be Brother HL-L2300D series. It should not require
   any additional drivers.
1. Select "More settings", then change "Margins" to "Default".
1. Uncheck "Options: Headers and footers".
1. Under "Options" unselect "Two-sided".
