import { computeDiff } from './diff'
import { Change, Span } from './change'
export { Change, Span }
export { simplifyChanges } from './simplify'

// ::- A change set tracks the changes to a document from a given
// point in the past. It condenses a number of step maps down to a
// flat sequence of replacements, and simplifies replacments that
// partially undo themselves by comparing their content.
export class ChangeSet {
  constructor(config, changes) {
    this.config = config
    // :: [Change] Replaced regions.
    this.changes = changes
  }

  // :: (Node, [StepMap], union<[any], any>) → ChangeSet
  // Computes a new changeset by adding the given step maps and
  // metadata (either as an array, per-map, or as a single value to be
  // associated with all maps) to the current set. Will not mutate the
  // old set.
  //
  // Note that due to simplification that happens after each add,
  // incrementally adding steps might create a different final set
  // than adding all those changes at once, since different document
  // tokens might be matched during simplification depending on the
  // boundaries of the current changed ranges.
  addSteps(newDoc, maps, data, steps) {
    // This works by inspecting the position maps for the changes,
    // which indicate what parts of the document were replaced by new
    // content, and the size of that new content. It uses these to
    // build up Change objects.
    //
    // These change objects are put in sets and merged together using
    // Change.merge, giving us the changes created by the new steps.
    // Those changes can then be merged with the existing set of
    // changes.
    //
    // For each change that was touched by the new steps, we recompute
    // a diff to try to minimize the change by dropping matching
    // pieces of the old and new document from the change.

    let stepChanges = []
    // Add spans for new steps.
    for (let i = 0; i < maps.length; i++) {
      let d = Array.isArray(data) ? data[i] : data
      let off = 0
      if (!maps[i].ranges.length) {
        const markStep = steps[i]
        stepChanges.push(
          new Change(
            markStep.from + off,
            markStep.to + off,
            markStep.from,
            markStep.to,
            [new Span(markStep.to - markStep.from, d)],
            [new Span(markStep.to - markStep.from, d)],
          ),
        )
      } else {
        maps[i].forEach((fromA, toA, fromB, toB) => {
          stepChanges.push(
            new Change(
              fromA + off,
              toA + off,
              fromB,
              toB,
              fromA == toA ? Span.none : [new Span(toA - fromA, d)],
              fromB == toB ? Span.none : [new Span(toB - fromB, d)],
            ),
          )

          off = toB - fromB - (toA - fromA)
        })
      }
    }
    if (stepChanges.length == 0) return this

    let newChanges = mergeAll(stepChanges, this.config.combine)
    let changes = Change.merge(this.changes, newChanges, this.config.combine)

    // Minimize changes when possible
    for (let i = 0; i < changes.length; i++) {
      let change = changes[i]
      if (
        change.fromA == change.toA ||
        change.fromB == change.toB ||
        // Only look at changes that touch newly added changed ranges
        !newChanges.some((r) => r.toB > change.fromB && r.fromB < change.toB)
      )
        continue
      let diff = computeDiff(this.config.doc.content, newDoc.content, change)

      // Fast path: If they are completely different, don't do anything
      if (diff.length == 1 && diff[0].fromB == 0 && diff[0].toB == change.toB - change.fromB) continue

      if (diff.length == 1) {
        changes[i] = diff[0]
      } else {
        changes.splice(i, 1, ...diff)
        i += diff.length - 1
      }
    }

    return new ChangeSet(this.config, changes)
  }

  // :: Node
  // The starting document of the change set.
  get startDoc() {
    return this.config.doc
  }

  // :: (f: (range: Change) → any) → ChangeSet
  // Map the span's data values in the given set through a function
  // and construct a new set with the resulting data.
  map(f) {
    return new ChangeSet(
      this.config,
      this.changes.map((change) => {
        let data = f(change)
        return data === change.data ? change : new Change(change.fromA, change.toA, change.fromB, change.toB, data)
      }),
    )
  }

  // :: (ChangeSet, ?[StepMap]) → ?{from: number, to: number}
  // Compare two changesets and return the range in which they are
  // changed, if any. If the document changed between the maps, pass
  // the maps for the steps that changed it as second argument, and
  // make sure the method is called on the old set and passed the new
  // set. The returned positions will be in new document coordinates.
  changedRange(b, maps) {
    if (b == this) return null
    let touched = maps && touchedRange(maps)
    let moved = touched ? touched.toB - touched.fromB - (touched.toA - touched.fromA) : 0
    function map(p) {
      return !touched || p <= touched.fromA ? p : p + moved
    }

    let from = touched ? touched.fromB : 2e8,
      to = touched ? touched.toB : -2e8
    function add(start, end = start) {
      from = Math.min(start, from)
      to = Math.max(end, to)
    }

    let rA = this.changes,
      rB = b.changes
    for (let iA = 0, iB = 0; iA < rA.length && iB < rB.length; ) {
      let rangeA = rA[iA],
        rangeB = rB[iB]
      if (rangeA && rangeB && sameRanges(rangeA, rangeB, map)) {
        iA++
        iB++
      } else if (rangeB && (!rangeA || map(rangeA.fromB) >= rangeB.fromB)) {
        add(rangeB.fromB, rangeB.toB)
        iB++
      } else {
        add(map(rangeA.fromB), map(rangeA.toB))
        iA++
      }
    }

    return from <= to ? { from, to } : null
  }

  toJSON() {
    return {
      changes: this.changes.map((c) => c.toJSON()),
    }
  }

  static fromJSON(doc, value, combine) {
    return new ChangeSet(
      { combine, doc },
      value.changes.map((c) => Change.fromJSON(c)),
    )
  }

  // :: (Node, ?(a: any, b: any) → any) → ChangeSet
  // Create a changeset with the given base object and configuration.
  // The `combine` function is used to compare and combine metadata—it
  // should return null when metadata isn't compatible, and a combined
  // version for a merged range when it is.
  static create(doc, combine = (a, b) => (a === b ? a : null)) {
    return new ChangeSet({ combine, doc }, [], [])
  }
}

// Exported for testing
ChangeSet.computeDiff = computeDiff

// : ([[Change]], (any, any) → any, number, number) → [Change]
// Divide-and-conquer approach to merging a series of ranges.
function mergeAll(ranges, combine, start = 0, end = ranges.length) {
  if (end == start + 1) return [ranges[start]]
  let mid = (start + end) >> 1
  return Change.merge(mergeAll(ranges, combine, start, mid), mergeAll(ranges, combine, mid, end), combine)
}

function endRange(maps) {
  let from = 2e8,
    to = -2e8
  for (let i = 0; i < maps.length; i++) {
    let map = maps[i]
    if (from != 2e8) {
      from = map.map(from, -1)
      to = map.map(to, 1)
    }
    map.forEach((_s, _e, start, end) => {
      from = Math.min(from, start)
      to = Math.max(to, end)
    })
  }
  return from == 2e8 ? null : { from, to }
}

function touchedRange(maps) {
  let b = endRange(maps)
  if (!b) return null
  let a = endRange(maps.map((m) => m.invert()).reverse())
  return { fromA: a.from, toA: a.to, fromB: b.from, toB: b.to }
}

function sameRanges(a, b, map) {
  return (
    map(a.fromB) == b.fromB &&
    map(a.toB) == b.toB &&
    sameSpans(a.deleted, b.deleted) &&
    sameSpans(a.inserted, b.inserted)
  )
}

function sameSpans(a, b) {
  if (a.length != b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i].length != b[i].length || a[i].data !== b[i].data) return false
  return true
}
