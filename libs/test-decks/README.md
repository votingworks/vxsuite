# Test Decks

Rendering of summary (BMD) ballot test decks.

This library sits above both `@votingworks/utils` (test deck ballot/CVR
generation) and `@votingworks/printing` (PDF rendering), allowing summary ballot
test deck rendering to live in one standalone package without introducing a
dependency cycle between those libraries.
