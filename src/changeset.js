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

let mapTouched = false
function mapStrict(ranges, pos, assoc, inverted) {
  let diff = 0, oldIndex = inverted ? 2 : 1, newIndex = inverted ? 1 : 2
  for (let i = 0; i < ranges.length; i += 3) {
    let start = ranges[i] - (inverted ? diff : 0)
    if (start > pos) break
    let oldSize = ranges[i + oldIndex], newSize = ranges[i + newIndex], end = start + oldSize
    if (pos <= end) {
      mapTouched = true
      return start + diff + (assoc < 0 ? 0 : newSize)
    }
    diff += newSize - oldSize
  }
  mapTouched = false
  return pos + diff
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
    let ranges = [], lastEnd = -1
    for (let iI = 0, iD = 0, off = 0;;) {
      let ins = iI == this.inserted.length ? null : this.inserted[iI]
      let del = iD == this.deleted.length ? null : this.deleted[iD]
      if (ins == null && del == null) return ranges
      if (del == null || (ins != null && ins.from < del.pos)) {
        let size = ins.to - ins.from
        if (lastEnd == ins.from + off) ranges[ranges.length - 1] += size
        else ranges.push(ins.from + off, 0, size)
        off -= size
        iI++
      } else {
        let size = del.to - del.from
        if (lastEnd == del.pos + off) ranges[ranges.length - 2] += size
        else ranges.push(del.pos + off, size, 0)
        lastEnd = del.pos + off + size
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
    let map = this.getMap()
    let touchedDeletions = []

    // Map existing inserted and deleted spans forward
    for (let i = 0, prev; i < this.inserted.length; i++) {
      let span = this.inserted[i], {from, to} = span
      for (let j = 0; j < maps.length && to > from; j++) {
        from = mapStrict(maps[j].ranges, from, 1)
        to = mapStrict(maps[j].ranges, to, -1)
      }
      if (inserted.length && (prev = inserted[inserted.length - 1]).to >= from) {
        if (this.config.compare(prev.data, span.data)) {
          inserted[inserted.length - 1] = new Span(prev.from, to, this.config.combine(prev.data, span.data))
          touchedDeletions.push(prev.from, to)
          continue
        } else if (prev.to > from) {
          touchedDeletions.push(from)
          from = prev.to
        }
      }
      if (to > from) inserted.push(from != span.from || to != span.to ? new Span(from, to, span.data) : span)
    }
    for (let i = 0; i < this.deleted.length; i++) {
      let span = this.deleted[i], pos = span.pos, touched = false
      for (let j = 0; j < maps.length; j++) {
        pos = mapStrict(maps[j].ranges, pos, -1)
        if (mapTouched) touched = true
      }
      if (touched) touchedDeletions.push(pos)
      deleted.push(pos == span.pos ? span : new DeletedSpan(span.from, span.to, span.data, pos, span.slice))
    }

    // Add spans for new steps.
    for (let i = 0, dI = 0; i < maps.length; i++, dI++) {
      // Map deletions backward to the original document, and add them
      // to `deleted`
      maps[i].forEach((fromA, toA, fromB, toB) => {
        for (let j = i - 1; j >= 0 && toA > fromA; j--) {
          fromA = mapStrict(maps[j].ranges, fromA, 1, true)
          toA = mapStrict(maps[j].ranges, toA, -1, true)
        }
        if (toA > fromA) {
          fromA = mapStrict(map, fromA, 1, true)
          toA = mapStrict(map, toA, -1, true)
          if (toA > fromA)
            Span.addBelow(deleted, fromA, toA, Array.isArray(data) ? data[dI] : data, this.config)
        }

        // Map insertions forward to the current one, and add them to
        // `inserted`.
        for (let j = i + 1; j < maps.length && toB > fromB; j++) {
          fromB = mapStrict(maps[j].ranges, fromB, 1)
          toB = mapStrict(maps[j].ranges, toB, -1)
        }
        if (toB > fromB)
          Span.add(inserted, fromB, toB, Array.isArray(data) ? data[dI] : data, this.config)
      })
    }

    // Restore the pos and slice on deleted spans that have been
    // updated
    for (let i = 0; i < deleted.length; i++) {
      let span = deleted[i], pos = span.pos, slice = span.slice
      if (!slice || touchedDeletions.indexOf(pos) > -1) {
        if (!slice) slice = this.config.doc.slice(span.from, span.to)
        pos = mapStrict(map, span.from, -1)
        for (let k = 0; k < maps.length; k++) pos = maps[k].map(pos, -1)
        for (let j = 0; j < inserted.length; j++) {
          let {from, to} = inserted[j]
          if (from < pos && to >= pos) pos = from
        }
        touchedDeletions.push(pos)
      }
      if (pos != span.pos || slice != span.slice)
        deleted[i] = new DeletedSpan(span.from, span.to, span.data, pos, slice)
    }

    // Merge deleted slices with adjacent insertions when possible.
    for (let i = 0, j = 0; i < deleted.length;) {
      let startI = i, pos = deleted[i].pos, here = []
      while (i < deleted.length && deleted[i].pos == pos) here.push(deleted[i++])
      if (touchedDeletions.indexOf(pos) < 0) continue

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
      i = startI + deletedPieces.length
      inserted.splice(touches, 1, ...insertedPieces)
      j += insertedPieces.length
    }

    return new ChangeSet(this.config, inserted, deleted)
  }

  // :: (mapDel: (from: number, to: number, pos: number, data: any) → any,
  //     mapIns: (from: number, to: number, data: any) → any) → ChangeSet
  // Map the span's data values in the given set through a function
  // and construct a new set with the resulting data.
  map(mapDel, mapIns) {
    return new ChangeSet(this.config, this.inserted.map(span => {
      let data = mapIns(span.from, span.to, span.data)
      return data === span.data ? span : new Span(span.from, span.to, data)
    }), this.deleted.map(span => {
      let data = mapDel(span.from, span.to, span.pos, span.data)
      return data == span.data ? span : new DeletedSpan(span.from, span.to, data, span.pos, span.slice)
    }))
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
