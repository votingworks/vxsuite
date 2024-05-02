# basics

An extended TS standard library of generic utility functions and types.

This library should only include utilities that are not specific to VotingWorks
products, but would be generally applicable to any TypeScript project (similar
to a library like lodash). In other words, it should be considered as an
extension of the standard TS libraries. This means it shouldn't depend on any
other monorepo packages (which will help avoid dependency cycles). Anything
complex or specific to a particular domain should live in its own library.
