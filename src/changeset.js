import {findDiffStart, findDiffEnd} from "./diff"
import {Span} from "./span"
export {Span}

// ::- Used to represent a deletion.
export class DeletedSpan extends Span {
  constructor(from, to, data, pos, slice) {
    super(from, to, data)
    // :: number The position of the deletion in the current document.
    this.pos = pos
    // :: Slice The deleted content.
    this.slice = slice
  }
}

// ::- An changeset tracks the changes to a document from a given
// point in the past. It condenses a number of step maps down to a
// flat sequence of insertions and deletions, and merges adjacent
// insertions/deletions that (partially) undo each other.
export class ChangeSet {
  constructor(config, maps, inserted, deleted) {
    this.config = config
    this.maps = maps
    // :: [Span]
    // Inserted regions. Their `from`/`to` point into the current
    // document.
    this.inserted = inserted
    // :: [DeletedSpan]
    // Deleted ranges. Their `from`/`to` point into the old document,
    // and their `pos` into the new.
    this.deleted = deleted
  }

  // :: (Node, [StepMap], union<[any], any>) → ChangeSet
  // Computes a new changeset by adding the given step maps and
  // metadata (either as an array, per-map, or as a single value to be
  // associated with all maps) to the current set. Will not mutate the
  // old set.
  addSteps(newDoc, maps, data) {
    // This works by inspecting the position maps for the changes,
    // which indicate what parts of the document were replaced by new
    // content, and the size of that new content. It maps all replaced
    // ranges backwards, to the start of the range of changes, and all
    // inserted ranges forward, to the end.
    //
    // The replaced ranges are added so that earlier deletions take
    // precedence (the first person to delete something is the one
    // responsible for its deletion), and the inserted ranges are
    // added so that later ones take precedence (the last person to
    // insert somewhere is responsible for the text there).
    //
    // The original document is then used to get a slice for each
    // deleted range, and the positions of those ranges are mapped
    // forward to positions in the resulting document.

    if (maps.length == 0) return this

    maps = this.maps.concat(maps)
    let inserted = [], deleted = []

    // Map existing inserted and deleted spans forward
    for (let i = 0; i < this.inserted.length; i++) {
      let span = this.inserted[i], {from, to} = span
      for (let j = this.maps.length; j < maps.length && to > from; j++) {
        from = maps[j].map(from, 1)
        to = maps[j].map(to, -1)
      }
      if (to > from) inserted.push(from != span.from || to != span.to ? new Span(from, to, span.data) : span)
    }
    for (let i = 0; i < this.deleted.length; i++) {
      let span = this.deleted[i], pos = span.pos
      for (let j = this.maps.length; j < maps.length; j++) pos = maps[j].map(pos, -1)
      deleted.push(pos == span.pos ? span : new DeletedSpan(span.from, span.to, span.data, pos, span.slice))
    }

    // Add spans for new steps.
    let newBoundaries = [] // Used to make sure new insertions are checked for merging
    for (let i = this.maps.length, dI = 0; i < maps.length; i++, dI++) {
      // Map deletions backward to the original document, and add them
      // to `deleted`
      maps[i].forEach((fromA, toA, fromB, toB) => {
        for (let j = i - 1; j >= 0 && toA > fromA; j--) {
          let inv = maps[j].invert()
          fromA = inv.map(fromA, 1)
          toA = inv.map(toA, -1)
        }
        if (toA > fromA)
          Span.addBelow(deleted, fromA, toA, Array.isArray(data) ? data[dI] : data, this.config)

        // Map insertions forward to the current one, and add them to
        // `inserted`.
        for (let j = i + 1; j < maps.length && toB > fromB; j++) {
          fromB = maps[j].map(fromB, 1)
          toB = maps[j].map(toB, -1)
        }
        if (toB > fromB) {
          newBoundaries.push(fromB, toB)
          Span.add(inserted, fromB, toB, Array.isArray(data) ? data[dI] : data, this.config)
        }
      })
    }

    // Restore the pos and slice on deleted spans that have been
    // updated, and merge deleted slices with adjacent insertions when
    // possible.
    for (let i = 0, j = 0; i < deleted.length; i++) {
      let span = deleted[i], merge = false
      if (!span.slice) {
        let pos = span.from
        for (let k = 0; k < maps.length; k++) pos = maps[k].map(pos, -1)
        deleted[i] = span = new DeletedSpan(span.from, span.to, span.data, pos,
                                            this.config.doc.slice(span.from, span.to))
        merge = true
      } else {
        merge = newBoundaries.indexOf(span.pos) > -1
      }

      // Check for adjacent insertions/deletions with compatible data
      // that fully or partially undo each other, and shrink or delete
      // them to clean up the output.
      if (merge) for (; j < inserted.length; j++) {
        let next = inserted[j]
        if (next.from > span.pos) break
        if (next.from < span.pos || !this.config.compare(span.data, next.data)) continue

        let slice = newDoc.slice(next.from, next.to)
        let sameStart = sliceSameTo(span.slice, slice)
        if (sameStart > 0) {
          if (sameStart >= next.to - next.from) inserted.splice(j--, 1)
          else inserted[j] = next = new Span(next.from + sameStart, next.to, next.data)
          if (sameStart >= span.to - span.from) { deleted.splice(i--, 1); break }
          deleted[i] = span = new DeletedSpan(span.from + sameStart, span.to, span.data, span.pos + sameStart,
                                              this.config.doc.slice(span.from + sameStart, span.to))
          slice = newDoc.slice(next.from, next.to)
        }
        let sameEnd = sliceSameFrom(span.slice, slice)
        if (sameEnd > 0) {
          if (sameEnd >= next.to - next.from) inserted.splice(j--, 1)
          else inserted[j] = new Span(next.from, next.to - sameEnd, next.data)
          if (sameEnd >= span.to - span.from) { deleted.splice(i--, 1); break }
          deleted[i] = span = new DeletedSpan(span.from, span.to - sameEnd, span.data, span.pos,
                                              this.config.doc.slice(span.from, span.to - sameEnd))
        }
      }
    }

    return new ChangeSet(this.config, maps, inserted, deleted)
  }

  // :: (Node, ?Object) → ChangeSet
  // Create a changeset with the given base object and
  // configuration. The `compare` and `combine` options should be
  // functions, and are used to compare and combine metadata—`compare`
  // determines whether two spans are compatible, and when they are,
  // `combine` will compute the metadata value for the merged span.
  static create(doc, {compare = (a, b) => a == b, combine = a => a} = {}) {
    let config = {compare, combine, doc}
    return new ChangeSet(config, [], [], [])
  }
}

function sliceSameTo(a, b) {
  let openA = a.openStart, openB = b.openStart, fragA = a.content, fragB = b.content
  for (; openA > openB; openA--) fragA = fragA.firstChild.content
  for (; openB > openA; openB--) fragB = fragB.firstChild.content
  let start = findDiffStart(fragA, fragB, 0)
  return Math.min(a.size, b.size, (start == null ? fragA.size : start) - openA)
}

function sliceSameFrom(a, b) {
  let openA = a.openEnd, openB = b.openEnd, fragA = a.content, fragB = b.content
  for (; openA > openB; openA--) fragA = fragA.lastChild.content
  for (; openB > openA; openB--) fragB = fragB.lastChild.content
  let end = findDiffEnd(fragA, fragB, fragA.size, fragB.size)
  return Math.min(a.size, b.size, fragA.size - (end ? end.a : 0) - openA)
}
