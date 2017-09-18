import {findDiffStart, findDiffEnd} from "./diff"
import {Span, addSpan, addSpanBelow} from "./span"
export {Span}

// ::- Used to represent a deletion.
class DeletedSpan extends Span {
  constructor(from, to, data, pos, slice) {
    super(from, to, data)
    this.pos = pos
    this.slice = slice
  }
}

class EditSetBase {
  constructor(doc, compare, combine) {
    this.doc = doc
    this.compare = compare
    this.combine = combine
  }
}

export class EditSet {
  constructor(base, maps, inserted, deleted) {
    this.base = base
    this.maps = maps
    this.inserted = inserted
    this.deleted = deleted
  }

  addSteps(newDoc, steps, data) {
    if (steps.length == 0) return this

    let maps = this.maps.concat(steps.map(s => s.getMap()))
    let inserted = [], deleted = this.deleted.concat()

    // Map existing inserted spans forward
    for (let i = 0; i < this.inserted.length; i++) {
      let span = this.inserted[i], {from, to} = span
      for (let j = this.maps.length; j < maps.length; j++) {
        from = maps[j].map(from, 1)
        to = maps[j].map(to, -1)
      }
      if (to > from) inserted.push(from != span.from || to != span.to ? new Span(from, to, span.data) : span)
    }

    // Add spans for new steps.
    let newBoundaries = [] // Used to make sure new insertions are checked for merging
    for (let i = this.maps.length; i < maps.length; i++) {
      // Map deletions backward to the original document, and add them
      // to `deleted`
      maps[i].forEach((fromA, toA, fromB, toB) => {
        for (let j = i - 1; j >= 0; j--) {
          let inv = maps[j].invert() // FIXME cache? store? use undocumented method?
          fromA = inv.map(fromA, 1)
          toA = inv.map(toA, -1)
        }
        if (toA > fromA)
          addSpanBelow(deleted, fromA, toA, data[i], this.base.compare, this.base.combine)

        // Map insertions forward to the current one, and add them to
        // `inserted`.
        for (let j = i + 1; j < maps.length; j++) {
          fromB = maps[j].map(fromB, 1)
          toB = maps[j].map(toB, -1)
        }
        if (toB > fromB) {
          newBoundaries.push(fromB, toB)
          addSpan(inserted, fromB, toB, data[i], this.base.compare, this.base.combine)
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
                                            this.base.doc.slice(span.from, span.to))
        merge = true
      } else {
        merge = span.pos.indexOf(newBoundaries) > -1
      }

      // Check for adjacent insertions/deletions with compatible data
      // that fully or partially undo each other, and shrink or delete
      // them to clean up the output.
      if (merge) for (; j < inserted.length; j++) {
        let next = inserted[j]
        if (next.from > span.pos) break
        if (next.from < span.pos || !this.base.compare(span.data, next.data)) continue

        let slice = newDoc.slice(next.from, next.to)
        let sameStart = sliceSameTo(span.slice, slice)
        if (sameStart > 0) {
          if (sameStart >= next.to - next.from) inserted.splice(j--, 1)
          else inserted[j] = next = new Span(next.from + sameStart, next.to, next.data)
          if (sameStart >= span.to - span.from) { deleted.splice(i--, 1); break }
          deleted[i] = span = new DeletedSpan(span.from + sameStart, span.to, span.data, span.pos + sameStart,
                                              this.base.doc.slice(span.from + sameStart, span.to))
          slice = newDoc.slice(next.from, next.to)
        }
        let sameEnd = sliceSameFrom(span.slice, slice)
        if (sameEnd > 0) {
          if (sameEnd >= next.to - next.from) inserted.splice(j--, 1)
          else inserted[j] = new Span(next.from, next.to - sameEnd, next.data)
          if (sameEnd >= span.to - span.from) { deleted.splice(i--, 1); break }
          deleted[i] = span = new DeletedSpan(span.from, span.to - sameEnd, span.data, span.pos,
                                              this.base.doc.slice(span.from, span.to - sameEnd))
        }
      }
    }
    // FIXME use reduceToContent somewhere?

    return new EditSet(this.base, maps, inserted, deleted)
  }

  static create(doc, compare=(a, b) => a == b, combine=a=>a) {
    return new EditSet(new EditSetBase(doc, compare, combine), [], [], [])
  }
}

// :: (Node, Node, [Step], [any]) → {deleted: [Deletion], inserted: [Span]}
//
// When given a document (before the changes) and a set of changes,
// this will determine the changes and insertions (relative to the
// document _after_ the changes) made by those changes.
//
// It works by inspecting the position maps for the changes, which
// indicate what parts of the document were replaced by new content,
// and the size of that new content. It maps all replaced ranges
// backwards, to the start of the range of changes, and all inserted
// ranges forward, to the end.
//
// The replaced ranges are added back-to-front, so that earlier
// deletions take precedence (the first person to delete something is
// the one responsible for its deletion), and the inserted ranges are
// added front-to-back (the last person to insert somewhere is
// responsible for the text there).
//
// The original document is then used to get text content for each
// deleted range, and the positions of those ranges are mapped forward
// to positions in the resulting document.
export function findEdits(oldDoc, newDoc, steps, data, compare, combine) {
  let set = EditSet.create(oldDoc, compare, combine).addSteps(newDoc, steps, data)
  return set
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

// Cut off unmatched opening/closing tokens from the sides of a slice,
// leaving only full nodes.
function reduceToContent(slice) {
  while (slice.openStart < slice.openEnd && slice.content.childCount == 1)
    slice = new slice.constructor(slice.content.firstChild.content, slice.openStart, slice.openEnd - 1)
  while (slice.openEnd < slice.openStart && slice.content.childCount == 1)
    slice = new slice.constructor(slice.content.firstChild.content, slice.openStart - 1, slice.openEnd)
  return slice
}
