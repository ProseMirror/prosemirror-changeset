import {StepMap} from "prosemirror-transform"
import {computeDiff, tokens} from "./diff"
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
  constructor(config, inserted, deleted) {
    this.config = config
    // :: [Span]
    // Inserted regions. Their `from`/`to` point into the current
    // document.
    this.inserted = inserted
    // :: [DeletedSpan]
    // Deleted ranges. Their `from`/`to` point into the old document,
    // and their `pos` into the new.
    this.deleted = deleted
  }

  getMap() {
    let ranges = []
    for (let iI = 0, iD = 0, off = 0;;) {
      let ins = iI == this.inserted.length ? null : this.inserted[iI]
      let del = iD == this.deleted.length ? null : this.deleted[iD]
      if (ins == null && del == null) return new StepMap(ranges)
      if (del == null || (ins != null && ins.from < del.pos)) {
        let size = ins.to - ins.from
        ranges.push(ins.from + off, 0, size)
        off -= size
        iI++
      } else if (ins && ins.from == del.pos) {
        let dSize = del.to - del.from, iSize = ins.to - ins.from
        ranges.push(del.pos + off, dSize, iSize)
        off += dSize - iSize
        iI++
        iD++
      } else {
        let size = del.to - del.from
        ranges.push(del.pos + off, size, 0)
        off += size
        iD++
      }
    }
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

    let inserted = [], deleted = []
    let map = this.getMap(), mapI = map.invert()

    // Map existing inserted and deleted spans forward
    for (let i = 0; i < this.inserted.length; i++) {
      let span = this.inserted[i], {from, to} = span
      for (let j = 0; j < maps.length && to > from; j++) {
        from = maps[j].map(from, 1)
        to = maps[j].map(to, -1)
      }
      if (to > from) inserted.push(from != span.from || to != span.to ? new Span(from, to, span.data) : span)
    }
    for (let i = 0; i < this.deleted.length; i++) {
      let span = this.deleted[i], pos = span.pos
      for (let j = 0; j < maps.length; j++) pos = maps[j].map(pos, -1)
      deleted.push(pos == span.pos ? span : new DeletedSpan(span.from, span.to, span.data, pos, span.slice))
    }

    // Add spans for new steps.
    let newBoundaries = [] // Used to make sure new insertions are checked for merging
    for (let i = 0, dI = 0; i < maps.length; i++, dI++) {
      // Map deletions backward to the original document, and add them
      // to `deleted`
      maps[i].forEach((fromA, toA, fromB, toB) => {
        for (let j = i - 1; j >= 0 && toA > fromA; j--) {
          let inv = maps[j].invert()
          fromA = inv.map(fromA, 1)
          toA = inv.map(toA, -1)
        }
        if (toA > fromA) {
          fromA = mapI.map(fromA, 1)
          toA = mapI.map(toA, -1)
          if (toA > fromA)
            Span.addBelow(deleted, fromA, toA, Array.isArray(data) ? data[dI] : data, this.config)
        }

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
    for (let i = 0; i < deleted.length; i++) {
      let span = deleted[i]
      if (!span.slice) {
        let pos = map.map(span.from, -1)
        for (let k = 0; k < maps.length; k++) pos = maps[k].map(pos, -1)
        deleted[i] = span = new DeletedSpan(span.from, span.to, span.data, pos,
                                            this.config.doc.slice(span.from, span.to))
      }
    }

    // FIXME don't diff at unchanged boundaries
    for (let i = 0, j = 0; i < deleted.length; i++) {
      let startI = i, here = [deleted[i]], pos = here[0].pos
      while (i < deleted.length - 1 && deleted[i + 1].pos == pos) here.push(deleted[++i])

      // Check for adjacent insertions/deletions with compatible data
      // that fully or partially undo each other, and shrink or delete
      // them to clean up the output.
      let touches = -1
      for (; j < inserted.length; j++) {
        let next = inserted[j]
        if (next.from > pos) break
        if (next.from < pos) continue
        // If any of the deleted spans at this position are compatible
        // with this inserted span, use it
        for (let k = 0; k < here.length; k++)
          if (this.config.compare(here[k].data, next.data)) touches = j
        break
      }
      if (touches == -1) continue

      let insSpan = inserted[touches]
      let insTokens = tokens(newDoc.content, insSpan.from, insSpan.to, [])
      let delTokens = []
      for (let k = 0; k < here.length; k++) {
        let {slice, data} = here[k]
        if (this.config.compare(data, insSpan.data))
          tokens(slice.content, slice.openStart, slice.content.size - slice.openEnd, delTokens)
        else // Intentionally invalid tokens so that they won't match anything
          for (let l = slice.size - 1; l >= 0; l--) delTokens.push(-2)
      }

      let diff = computeDiff(delTokens, insTokens)
      // Fast path: If they are completely different and there's only
      // one deletion involved, don't do anything
      if (here.length == 1 && diff.length == 1 && diff[0].fromB == 0 && diff[0].toB == insTokens.length)
        continue

      let deletedPieces = [], insertedPieces = []
      for (let k = 0; k < diff.length; k++) {
        let {fromA, toA, fromB, toB} = diff[k]
        if (fromA < toA) {
          // Divide the different tokens over the corresponding deleted spans
          for (let l = 0, tok = 0; l < here.length; l++) {
            let span = here[l], end = tok + span.slice.size
            if (end > fromA && tok < toA) { // Overlaps with this change
              let docFrom = span.from + Math.max(0, fromA - tok), docTo = span.from + Math.min(toA, end) - tok
              deletedPieces.push(new DeletedSpan(docFrom, docTo, span.data, insSpan.from + fromB,
                                                 this.config.doc.slice(docFrom, docTo)))
            }
            tok = end
          }
        }
        if (fromB < toB)
          insertedPieces.push(new Span(insSpan.from + fromB, insSpan.from + toB, insSpan.data))
      }

      deleted.splice(startI, here.length, ...deletedPieces)
      i = startI + deletedPieces.length - 1
      inserted.splice(touches, 1, ...insertedPieces)
      j += insertedPieces.length
    }

    return new ChangeSet(this.config, inserted, deleted)
  }

  // :: (Node, options: ?{compare: ?(a: any, b: any) → boolean, combine: ?(a: any, b: any) → any}) → ChangeSet
  // Create a changeset with the given base object and
  // configuration. The `compare` and `combine` options should be
  // functions, and are used to compare and combine metadata—`compare`
  // determines whether two spans are compatible, and when they are,
  // `combine` will compute the metadata value for the merged span.
  static create(doc, {compare = (a, b) => a == b, combine = a => a} = {}) {
    let config = {compare, combine, doc}
    return new ChangeSet(config, [], [])
  }
}

// Exported for testing
ChangeSet.computeDiff = computeDiff
ChangeSet.tokens = tokens
