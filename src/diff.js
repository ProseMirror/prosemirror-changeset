// Convert the given range of a fragment to tokens, where node open
// tokens are encoded as strings holding the node name, characters as
// their character code, and node close tokens as -1.
function tokens(frag, start, end, target) {
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

// The diff algorithm stores two values into a single number (a length
// and a flag), which is what these constants are used for
const LEN_MASK = 0x1fffffff, FLAG_SHIFT = 29
const FLAG_DEL = 1 << FLAG_SHIFT, FLAG_INS = 2 << FLAG_SHIFT, FLAG_SAME = 3 << FLAG_SHIFT

const MAX_DIFF_COMPLEXITY = 10000
const IGNORE_SMALL_SAME = 1

// : (Fragment, Fragment, number, number, number) → [Change]
export function computeDiff(a, fromA, toA, b, fromB, toB) {
  if (fromA == toA || fromB == toB) {
    if (fromA == toA && fromB == toB) return []
    return [new Change(fromA, toA, fromB, toB)]
  }

  let tokA = tokens(a, fromA, toA, []), tokB = tokens(b, fromB, toB, [])
  let lenA = tokA.length, lenB = tokB.length
  // Scan from both sides to cheaply eliminate work
  let start = 0, endA = lenA, endB = lenB
  while (start < lenA && start < lenB && tokA[start] === tokB[start]) start++
  if (start == lenA && start == lenB) return []
  while (endA > start && endB > start && tokA[endA - 1] === tokB[endB - 1]) endA--, endB--
  // If the result is simple _or_ too big to cheaply compute, return
  // the remaining region as the diff
  if (endA == start || endB == start || (endA == endB && endA == start + 1) ||
      (endA - start) * (endB - start) > MAX_DIFF_COMPLEXITY)
    return [new Change(fromA + start, fromA + endA, fromB + start, fromB + endB)]

  // Longest common subsequence algorithm, based on
  // https://en.wikipedia.org/wiki/Longest_common_subsequence_problem#Code_for_the_dynamic_programming_solution
  let table = [], cols = endA - start, rows = endB - start
  for (let y = 0, index = 0; y < rows; y++) {
    let tokenB = tokB[y + start]
    for (let x = 0; x < cols; x++) {
      let tokenA = tokA[x + start]
      if (tokenA === tokenB) {
        table[index] = ((x == 0 || y == 0 ? 0 : table[index - 1 - cols] & LEN_MASK) + 1) | FLAG_SAME
      } else {
        let del = x == 0 ? 0 : table[index - 1] & LEN_MASK
        let ins = y == 0 ? 0 : table[index - cols] & LEN_MASK
        table[index] = del < ins ? ins | FLAG_INS : del | FLAG_DEL
      }
      index++
    }
  }

  let result = [], offA = fromA + start, offB = fromB + start
  for (let x = cols, y = rows, cur = null, index = table.length - 1; x > 0 || y > 0;) {
    let startX = x, startY = y
    let flag = x == 0 ? FLAG_INS : y == 0 ? FLAG_DEL : table[index] & ~LEN_MASK

    if (flag == FLAG_SAME) {
      x--, y--
      index -= cols + 1
      // FIXME ignore bigger chunks for bigger diffed ranges? to avoid diff soup for big overwrites
      if (cur && (cur.fromA > x + offA + IGNORE_SMALL_SAME || cur.fromB > y + offB + IGNORE_SMALL_SAME)) cur = null
    } else {
      if (flag == FLAG_DEL) x--, index--
      else y--, index -= cols
      if (cur) cur.fromA = x + offA, cur.fromB = y + offB
      else result.push(cur = new Change(x + offA, startX + offA, y + offB, startY + offB))
    }
  }
  return result.reverse()
}
