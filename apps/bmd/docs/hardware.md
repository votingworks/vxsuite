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

- Turn on computer, answer basic questions about region and keyboard layout,
  connect to wifi, and allow it to install updates.
- Select: "Set up for personal use".
- On the "Sign in with Microsoft" screen, select "Offline account", and then
  confirm that you do not want to sign in with Microsoft.
- On the "Who’s going to use this PC?" screen, enter: VotingWorks
- On the "Create a super memorable password" screen, enter a password of your
  choice and then enter the password again to confirm.
- On the "Add a hint for your password" screen, enter a hint of your choice
- On the "Use your face to sign in faster and more securely" screen, click "Skip
  for now".
- On the "Make Cortana your personal assistant?" screen, click "No".
- On the "Choose privacy settings for your device" screen, disable all privacy
  options: Location, Diagnostics, Relevant Ads, Speech recognition, Tailored
  experiences with diagnostic data, etc. Then click "Accept".
- You should now be at the desktop of the computer.
- Click the windows icon in the lower left.
- Click the gear (Settings)
- Click "Accounts"
- Click "Sign-in options"
- Under "Require sign-in" select "Never"
- Go back to Settings home
- Click "System", then click "Display"
- Change the "Scale and layout" setting to 100%
- Close the Settings window.
- In the search box (bottom left), type "netplwiz" and then click "netplwiz Run
  command".
- In the window that appears, uncheck "Users must enter a user name and password
  to use this computer"
- Click "Apply", then in the modal that appears, enter user name and password of
  the default user set up earlier. Then click "OK".
- Click "OK" to close the window.

### Install Chrome

- Open Microsoft Edge (or Explorer) and go to https://www.google.com/chrome.
- Click Download Chrome.
- Uncheck option to "Help make Google Chrome better…"
- Click Accept and Install and then click Run to install Chrome.
- "Do you want to allow this app to make changes to your device?" Click Yes.
- Chrome will download, install, and open.
- Quit Edge

### Configure Chrome Service Workers

- In Chrome browser, go to https://bmd.votingworks.app.
- In the top-right menu marked with three vertical dots ︙ (or the "Customize
  and control Google Chrome" menu), select "More tools", then "Developer tools".
  A sidebar will open.
- Select the "Application" tab. (It may not be visible, you may only see
  Elements, Console, Sources... If so, click the >> arrow, and you'll see a
  dropdown with "Application" as one option. Click it.)
- Click "Service Workers", then check the box "Update on reload"
- Close the developer tools by clicking the "✕" in the upper right hand corner
  of the sidebar (below the Google Chrome menu you first opened up before the
  sidebar opened.)

## Setup ChromeVox

Be aware as soon as this extension is installed it will begin to speak the
interface.

_To disable the audio_, press shortcut Shift-Alt-A (as one), then A again. To
enable, use the same command.

- Install the ChromeVox extension from the Chrome Web Store.
- In Chrome browser, search for "ChromeVox extension" or go to
  https://chrome.google.com/webstore/detail/chromevox/kgejglhpjiefppelpmljglcjbhoiplfn?hl=en
- Click "Add to Chrome", then "Add extension" in the confirmation modal.
- Close Chrome
- Open the VotingWorks shortcut and confirm that ChromeVox is working.

## Install BMD in Kiosk Mode

Install BMD as PWA (Progressive Web App) in kiosk mode.

- In the top-right menu marked with three vertical dots ︙ (or the "Customize
  and control Google Chrome" menu), click on the item "Install VotingWorks
  Ballot Marking Device…".
- In the modal that appears, click "Install". This will place a VotingWorks
  Ballot Marking Device shortcut on the desktop.
- Close/Quit Google Chrome.
- Right-click the shortcut, and select "Properties" in the menu.
- In the Properties window that appears, select the "Shortcut" tab.
- Under "Target" there is a string. Append the following to the end of the
  string: " --kiosk --kiosk-printing"
- Click "Apply" then "OK"

## Launch and Exit BMD in Kiosk Mode

Use the desktop shortcut to launch the BMD in kiosk mode.

Use the keyboard shortcut Alt+F4 (or Ctrl+W) to exit kiosk mode.

## Update BMD to Latest Version (as necessary)

- Close the VotingWorks BMD App with shortcut: Alt+F4.
- Launch Chrome, and go to https://bmd.votingworks.app.
- If on the "Scan Activation Code" page, click the QR code, then use shortcut:
  Ctrl-K to get to the "Configure Ballot Marking Device" screen.
- Force reload the app with the shortcut: Shift-Ctrl-R.
- Configure the BMD with the election.json file.
- Close Google Chrome.
- Launch the BMD, using the desktop shortcut: VotingWorks Ballot Marking Device.

## Setup and Install Brother HL-L2300D Printer

- Unpack printer, load the toner cartridge, load paper, plug in, turn on
- Open browser, go to random web page, and select print (or Ctrl-P).
- Select "Destination" to be Brother HL-L2300D series. It should not require any
  additional drivers.
- Select "More settings", then change "Margins" to "None".
- Under "Options" unselect "Two-sided".
