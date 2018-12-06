// Convert the given range of a fragment to tokens, where node open
// tokens are encoded as strings holding the node name, characters as
// their character code, and node close tokens as -1.
export function tokens(frag, start, end, target) {
  for (let i = 0, off = 0; i < frag.childCount; i++) {
    let child = frag.child(i), endOff = off + child.nodeSize
    let from = Math.max(off, start), to = Math.min(endOff, end)
    if (from < to) {
      if (child.isText) {
        for (let j = from; j < to; j++) target.push(child.text.charCodeAt(j - off))
      } else if (child.isLeaf) {
        target.push(child.type.name)
      } else {
        if (from == off) target.push(child.type.name)
        tokens(child.content, Math.max(off + 1, from) - off - 1, Math.min(endOff - 1, to) - off - 1, target)
        if (to == endOff) target.push(-1)
      }
    }
    off = endOff
  }
  return target
}

export class Change {
  constructor(fromA, toA, fromB, toB) {
    this.fromA = fromA; this.toA = toA
    this.fromB = fromB; this.toB = toB
  }
}

// The code below will refuse to compute a diff with more than 5000
// insertions or deletions, which takes about 300ms to reach on my
// machine. This is a safeguard against runaway computations.
const MAX_DIFF_SIZE = 5000

// This obscure mess of constants computes the minimum length of an
// unchanged range (not at the start/end of the compared content). The
// idea is to make it higher in bigger replacements, so that you don't
// get a diff soup of coincidentally identical letters when replacing
// a paragraph.
function minUnchanged(sizeA, sizeB) {
  return Math.min(15, Math.max(2, Math.floor(Math.max(sizeA, sizeB) / 10)))
}

// : ([any], [any]) → [Change]
export function computeDiff(tokA, tokB) {
  // Scan from both sides to cheaply eliminate work
  let start = 0, endA = tokA.length, endB = tokB.length
  while (start < tokA.length && start < tokB.length && tokA[start] === tokB[start]) start++
  if (start == tokA.length && start == tokB.length) return []
  while (endA > start && endB > start && tokA[endA - 1] === tokB[endB - 1]) endA--, endB--
  // If the result is simple _or_ too big to cheaply compute, return
  // the remaining region as the diff
  if (endA == start || endB == start || (endA == endB && endA == start + 1))
    return [new Change(start, endA, start, endB)]

  // This is an implementation of Myers' diff algorithm
  // See https://neil.fraser.name/writing/diff/myers.pdf and
  // https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/

  let lenA = endA - start, lenB = endB - start
  let max = Math.min(MAX_DIFF_SIZE, lenA + lenB), off = max + 1
  let history = []
  let frontier = []
  for (let len = off * 2, i = 0; i < len; i++) frontier[i] = -1

  for (let size = 0; size <= max; size++) {
    for (let diag = -size; diag <= size; diag += 2) {
      let next = frontier[diag + 1 + max], prev = frontier[diag - 1 + max]
      let x = next < prev ? prev : next + 1, y = x + diag
      while (x < lenA && y < lenB && tokA[start + x] === tokB[start + y]) x++, y++
      frontier[diag + max] = x
      // Found a match
      if (x >= lenA && y >= lenB) {
        // Trace back through the history to build up a set of changed ranges.
        let diff = [], minSpan = minUnchanged(endA - start, endB - start)
        for (let i = size - 1; i >= 0; i--) {
          let next = frontier[diag + 1 + max], prev = frontier[diag - 1 + max]
          if (next < prev) { // Deletion
            diag--
            x = prev + start; y = x + diag
            add(diff, minSpan, x, x, y, y + 1)
          } else { // Insertion
            diag++
            x = next + start; y = x + diag
            add(diff, minSpan, x, x + 1, y, y)
          }
          frontier = history[i >> 1]
        }
        return diff.reverse()
      }
    }
    // Since only either odd or even diagonals are read from each
    // frontier, we only copy them every other iteration.
    if (size % 2 == 0) history.push(frontier.slice())
  }
  // The loop exited, meaning the maximum amount of work was done.
  // Just return a change spanning the entire range.
  return [new Change(start, endA, start, endB)]
}

// Used to add steps to a diff one at a time, back to front, merging
// ones that are less than minSpan tokens apart
function add(diff, minSpan, fromA, toA, fromB, toB) {
  let last = diff.length ? diff[diff.length - 1] : null
  if (last && last.fromA < toA + minSpan) {
    last.fromA = fromA
    last.fromB = fromB
  } else {
    diff.push(new Change(fromA, toA, fromB, toB))
  }
}
