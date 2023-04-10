# Writing Style Guide

The VotingWorks interfaces for voters, poll workers, and admins should strive to be simple, intuitive, efficient, confidence instilling, and delightful where possible.

## General Guidance

- Instill confidence in the user with short, clear, and simple phrases.
- Increase readability by using less words where possible.
- Use consistent copy to avoid confusion.
- Use more common/generic terms to avoid election jargon.

## Guide the User

As most Voter and Poll Worker actions are linear flows, we should guide them on a path with each step being a single decision, or sometimes a few related decisions. 

Admin and Super Admin users should also be guided where possible, but will often need a UI with more choices as their process is less linear. It should be assumed that these users will be using the software with additional documentation and training.

## Proactive Flows

Rather than present multiple actions to a user, when we have enough context to assume the action which a user may want to perform, we can provide a prompt to ask if they would like to perform the assumed action. Examples of proactive flows:

- Suggesting open/close polls when poll worker inserts card into VxScan.
- Showing program card modal in VxAdmin when a card is inserted. 
- When a voter makes a contest selection, the "Next Contest" button turns green to suggest the next action.

## Headings

Use headings to arrange content into thematic groups. Headings improve readability by allowing a user to scan a hierarchy of content and more quickly find what they are looking for. 

## Modals 

All actions which will make a significant change (creation or destruction) should use a moal to confirm the users intent. They may also be used if additional information or decisions need to be made before performing an action.

Typically modals put the user into a "mode" where they need to make or confirm a decision. There are two types of "modals": the simple confirmation modal and a fullscreen modal.

### Confirmation Modal

Confirmation modals are displayed over the top of the existing UI with a fullscreen transparent "curtain" obscuring the UI underneath. Clicking the curtain triggers the "Cancel"/"Go Back" option.

The component for overlay modals has options for the following content:

- Title: A concise question or topic.
- Content: Provide additional context/details about the decision being made. 
- Buttons: The buttons at the bottom of the modal are the answers to the title question: 
    - The main affirmative answer/action (primary/green or destructive/red button) is the right-most button.
    - The "Cancel" or "No" answer/action is placed on the left.
    - Other secondary "affirmative" actions are be placed to the left of the right-most button.

### Fullscreen Modal

Fullscreen modals take over the full screen -- header, footer, navigation, etc. are all hidden -- and uses a fully custom UI based upon the task to complete. Examples: Hardware Diagnostics, Write-In Adjudication, etc.

## Button Labels

Most buttons labels should use short phrases to keep the buttons short and concise.
  - contextually relevant.
  - increase user confidence.

Button labels are typically either commands -- in the form of "verb noun" -- such as "Print Ballot", "Unconfigure Machine", "Load Election Definition", or "See More". Sometimes they are also answers to a question "Yes, Lock Election", "Yes, Remove", "No, Return Ballot", etc.

Where contextually relevant, many buttons are a single word ("Reset", "Cancel", "Lock", "Okay", "Accept") 

