## 1.2.1 (2018-11-15)

### Bug fixes

Properly apply the heuristics for ignoring short matches when diffing, and adjust those heuristics to more agressively weed out tiny matches in large changes.

## 1.2.0 (2018-11-08)

### New features

The new `changedRange` method can be used to compare two change sets and find out which range has changed.

## 1.1.0 (2018-11-07)

### New features

Add a new method, `ChangeSet.map` to update the data associated with changed ranges.

## 1.0.5 (2018-09-25)

### Bug fixes

Fix another issue where overlapping changes that can't be merged could produce a corrupt change set.

## 1.0.4 (2018-09-24)

### Bug fixes

Fixes an issue where `addSteps` could produce invalid change sets when a new step's deleted range overlapped with an incompatible previous deletion.

## 1.0.3 (2017-11-10)

### Bug fixes

Fix issue where deleting, inserting, and deleting the same content would lead to an inconsistent change set.

## 1.0.2 (2017-10-19)

### Bug fixes

Fix a bug that caused `addSteps` to break when merging two insertions into a single deletion.

## 1.0.1 (2017-10-18)

### Bug fixes

Fix crash in `ChangeSet.addSteps`.

## 1.0.0 (2017-10-13)

First stable release.
