# Architecture

This repository, BMD, is a front-end React application that can do just about
everything in front-end web. However, some features are beyond the web
environment:

- reading / writing smart cards
- printing without a flashing dialog (darn Chrome Kiosk mode)
- possibly more in the future

## The "Big" Idea

To make these features available to the front-end, we serve the React static
HTML+CSS+JS from a localhost web server, and that localhost web server provides
URL endpoints that implement the missing features using code running directly on
the machine.

## DRY & Minimizing Features

The ability to read/write smart cards is important for the BMD, the Ballot
Activation Station (BAS), the scanner, and the Election Management System (EMS).
However, certain features may only be useful for a subset of those systems.
Copy/pasting the code for these doesn't seem useful. So we implement each
logical chunk of features as a small web server that does its own thing, e.g. a
smart-card web server whose only job it is to expose smart-card functions as a
local web server.

## Putting it all together

A given system, like this BMD, needs 2 or 3 server backends. Same Origin Policy
tells us it has to all come from one server. So, we build our system with each
component (BMD, BAS, Scanner, EMS) as follows:

- a React front-end
- a single Web backend for that component whose job it is to serve the React
  code and proxy HTTP requests to the appropriate backend.
- all of the necessary backends running as independent servers.
