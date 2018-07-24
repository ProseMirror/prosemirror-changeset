// Scan fragments from a given start position, looking for the first
// difference. Does not compare attributes or marks, only node
// structure and text. Null means no difference
export function findDiffStart(a, b, pos) {
  for (let i = 0;; i++) {
    if (i == a.childCount || i == b.childCount)
      return a.childCount == b.childCount ? null : pos

    let childA = a.child(i), childB = b.child(i)
    if (childA == childB) { pos += childA.nodeSize; continue }

    if (childA.type != childB.type) return pos

    if (childA.isText && childA.text != childB.text) {
      for (let j = 0; childA.text[j] == childB.text[j]; j++)
        pos++
      return pos
    }
    if (childA.content.size || childB.content.size) {
      let inner = findDiffStart(childA.content, childB.content, pos + 1)
      if (inner != null) return inner
    }
    pos += childA.nodeSize
  }
}

// Scan fragments back from a given end position, looking for the
// first difference. Returns null if no difference can be found
export function findDiffEnd(a, b, posA, posB) {
  for (let iA = a.childCount, iB = b.childCount;;) {
    if (iA == 0 || iB == 0)
      return iA == iB ? null : {a: posA, b: posB}

    let childA = a.child(--iA), childB = b.child(--iB), size = childA.nodeSize
    if (childA == childB) {
      posA -= size; posB -= size
      continue
    }

    if (childA.type != childB.type) return {a: posA, b: posB}

    if (childA.isText && childA.text != childB.text) {
      let same = 0, minSize = Math.min(childA.text.length, childB.text.length)
      while (same < minSize && childA.text[childA.text.length - same - 1] == childB.text[childB.text.length - same - 1]) {
        same++; posA--; posB--
      }
      return {a: posA, b: posB}
    }
    if (childA.content.size || childB.content.size) {
      let inner = findDiffEnd(childA.content, childB.content, posA - 1, posB - 1)
      if (inner) return inner
    }
    posA -= size; posB -= size
  }
}

// Convert the given range of a fragment to tokens, where node open
// tokens are encoded as strings holding the node name, characters as
// their character code, and node close tokens as -1.
function tokens(frag, start, end, target) {
  for (let i = 0, off = 0; i < frag.childCount; i++) {
    let child = frag.child(i), endOff = off + child.nodeSize
    let from = Math.max(off, start), to = Math.min(endOff, end)
    if (from < to) {
      if (child.isText) {
        for (let i = from; i < to; i++) target.push(child.text.charCodeAt(i - off))
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

// The diff algorithm stores two values into a single number (a length
// and a flag), which is what these constants are used for
const LEN_MASK = 0x1fffffff, FLAG_SHIFT = 29
const FLAG_DEL = 1 << FLAG_SHIFT, FLAG_INS = 2 << FLAG_SHIFT, FLAG_SAME = 3 << FLAG_SHIFT

const MAX_DIFF_COMPLEXITY = 10000
const IGNORE_SMALL_SAME = 1

// : (Fragment, Fragment, number, number, number) → [Change]
export function computeDiff(a, b, start, aEnd, bEnd) {
  // Scan from both sides to cheaply eliminate work
  start = findDiffStart(a, b, start)
  if (start == null) return []
  ;({a: aEnd, b: bEnd} = findDiffEnd(a, b, aEnd, bEnd))
  // If the result is simple _or_ too big to cheaply compute, return
  // the remaining region as the diff
  if (start == aEnd || start == bEnd || (aEnd == bEnd && aEnd == start + 1) ||
      (aEnd - start) * (bEnd - start) > MAX_DIFF_COMPLEXITY)
    return [new Change(start, aEnd, start, bEnd)]

  let tokA = tokens(a, start, aEnd, []), tokB = tokens(b, start, bEnd, [])
  let aLen = tokA.length, bLen = tokB.length, table = []

  // Longest common subsequence algorithm, based on
  // https://en.wikipedia.org/wiki/Longest_common_subsequence_problem#Code_for_the_dynamic_programming_solution
  for (let y = 0, index = 0; y < bLen; y++) {
    let tokenB = tokB[y]
    for (let x = 0; x < aLen; x++) {
      let tokenA = tokA[x]
      if (tokenA === tokenB) {
        table[index] = ((x == 0 || y == 0 ? 0 : table[index - 1 - aLen] & LEN_MASK) + 1) | FLAG_SAME
      } else {
        let del = x == 0 ? 0 : table[index - 1] & LEN_MASK
        let ins = y == 0 ? 0 : table[index - aLen] & LEN_MASK
        table[index] = del < ins ? ins | FLAG_INS : del | FLAG_DEL
      }
      index++
    }
  }

  // FIXME simplify output by ignoring short unchanged ranges?
  let result = []
  for (let x = aLen, y = bLen, cur = null, index = table.length - 1; x > 0 || y > 0;) {
    let startX = x, startY = y
    let flag = x == 0 ? FLAG_INS : y == 0 ? FLAG_DEL : table[index] & ~LEN_MASK

    if (flag == FLAG_SAME) {
      x--, y--
      index -= aLen + 1
      if (cur && (cur.fromA > x + start + IGNORE_SMALL_SAME || cur.fromB > y + start + IGNORE_SMALL_SAME)) cur = null
    } else {
      if (flag == FLAG_DEL) x--, index--
      else y--, index -= aLen
      if (cur) cur.fromA = x + start, cur.fromB = y + start
      else result.push(cur = new Change(x + start, startX + start, y + start, startY + start))
    }
  }
  return result.reverse()
}
