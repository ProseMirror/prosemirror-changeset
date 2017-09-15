import {findDiffStart, findDiffEnd} from "./diff"
import {Span, join, addSpan} from "./span"

// ::- Used to represent a deletion.
class Deletion {
  constructor(pos, slice, changes) {
    this.pos = pos
    this.slice = slice
    this.changes = changes
  }
}

// :: (Node, [Change]) → {deleted: [Deletion], inserted: [Span]}
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
export function findEdits(oldDoc, newDoc, changes) {
  let maps = changes.map(ch => ch.step.getMap())
  let inverted = maps.map(m => m.invert())

  // Map deletions to the original document
  let atStart = []
  for (let i = changes.length - 1; i >= 0; i--) {
    maps[i].forEach((from, to) => {
      for (let j = i - 1; j >= 0; j--) {
        from = inverted[j].map(from, 1)
        to = inverted[j].map(to, -1)
      }
      if (to > from) addSpan(atStart, from, to, changes[i])
    })
  }
  // Map insertions to the current document
  let atEnd = []
  for (let i = 0; i < changes.length; i++) {
    maps[i].forEach((_from, _to, from, to) => {
      for (let j = i + 1; j < changes.length; j++) {
        from = maps[j].map(from, 1)
        to = maps[j].map(to, -1)
      }
      if (to > from) addSpan(atEnd, from, to, changes[i])
    })
  }

  let deleted = []
  gather: for (let i = 0; i < atStart.length; i++) {
    let {from, to, author, changes} = atStart[i], pos = from
    // Map the position of this deletion to a position in the current document
    for (let j = 0; j < maps.length; j++) pos = maps[j].map(pos, -1)

    let slice = oldDoc.slice(from, to)
    // Check for adjacent insertions/deletions by the same author that
    // fully or partially undo each other, and shrink or delete them
    // to clean up the output.
    for (let j = 0; j < atEnd.length; j++) {
      let other = atEnd[j]
      if (other.author != author || pos != other.from) continue
      let otherSlice = newDoc.slice(other.from, other.to)
      let sameStart = sliceSameTo(slice, otherSlice)
      if (sameStart > 0) {
        if (sameStart >= other.to - other.from) atEnd.splice(j--, 1)
        else atEnd[j] = other = new Span(other.from + sameStart, other.to, other.changes)
        if (sameStart >= to - from) continue gather
        from += sameStart
        pos += sameStart
        slice = oldDoc.slice(from, to)
        otherSlice = newDoc.slice(other.from, other.to)
      }
      let sameEnd = sliceSameFrom(slice, otherSlice)
      if (sameEnd > 0) {
        if (sameEnd >= other.to - other.from) atEnd.splice(j--, 1)
        else atEnd[j] = new Span(other.from, other.to - sameEnd, other.changes)
        if (sameEnd >= to - from) continue gather
        to -= sameEnd
        slice = oldDoc.slice(from, to)
      }
    }

    slice = reduceToContent(slice)
    if (slice.size) deleted.push(new Deletion(pos, slice, changes))
  }

  return {deleted, inserted: atEnd}
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
