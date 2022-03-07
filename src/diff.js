const IGNORED_ATTRS = {
  blockId: true,
}

const IGNORED_MARKS = {
  comment: true,
}

const getMarksString = (node) => {
  let marksString = ''
  let keys = Object.keys(node.marks)
  keys.sort()
  for (let i = 0; i < keys.length; i++) {
    const mark = node.marks[keys[i]]

    if (IGNORED_MARKS[mark.type.name]) {
      continue
    }

    marksString += `${keys[i]}:${mark.type.name}`
  }

  return marksString
}

const getAttributesString = (node) => {
  let attrsString = ''
  let keys = Object.keys(node.attrs)
  keys.sort()
  for (let i = 0; i < keys.length; i++) {
    if (!IGNORED_ATTRS[keys[i]]) {
      attrsString += `${keys[i]}:${node.attrs[keys[i]]}`
    }
  }
  return attrsString
}

// Convert the given range of a fragment to tokens, where node open
// tokens are encoded as strings holding the node name, characters as
// their character code, and node close tokens as -1.
function tokens(frag, start, end, target) {
  for (let i = 0, off = 0; i < frag.childCount; i++) {
    let child = frag.child(i),
      endOff = off + child.nodeSize
    let from = Math.max(off, start),
      to = Math.min(endOff, end)
    if (from < to) {
      if (child.isText) {
        for (let j = from; j < to; j++) target.push(`${child.text.charCodeAt(j - off)}${getMarksString(child)}`)
      } else if (child.isLeaf) {
        target.push(`${child.type.name}${getAttributesString(child)}`)
      } else {
        if (from == off) target.push(`${child.type.name}${getAttributesString(child)}`)
        tokens(child.content, Math.max(off + 1, from) - off - 1, Math.min(endOff - 1, to) - off - 1, target)
        if (to == endOff) target.push(-1)
      }
    }
    off = endOff
  }
  return target
}

// This obscure mess of constants computes the minimum length of an
// unchanged range (not at the start/end of the compared content). The
// idea is to make it higher in bigger replacements, so that you don't
// get a diff soup of coincidentally identical letters when replacing
// a paragraph.
function minUnchanged(sizeA, sizeB) {
  return Math.min(15, Math.max(2, Math.floor(Math.max(sizeA, sizeB) / 10)))
}

const FENCED_NODE_NAMES = [
  'heading'
]

// : ([string | number]) → [[number, number, string]]
// This function parses an array of tokens looking for ranges that represent a
// fenced nodes, and return a list of tuples with information about those
// nodes. Each tuple contains, in order:
// - the start position of the node
// - the end position of the node
// - a hash of the content of the node
function findFencedNodes(a) {
  let from = null
  let to = null
  let edges = []
  for (let i = 0, len = a.length; i < len; i++) {
    if (typeof a[i] === 'string' && FENCED_NODE_NAMES.some(nodeName => a[i].includes(nodeName))) {
      from = i
    }
    if (a[i] === -1) {
      to = i
      edges.push([from, to])
      from = null
      to = null
    }
  }
  return edges.reduce((acc, [from, to]) => {
    return [...acc, [from, to, a.slice(from, to + 1).join('-')]]
  }, [])
}

// This is the char we replace tokens of matching fenced nodes with. The only
// requirement is that it's not a charcode, so that we don't run the risk of
// getting in the way of the diff algorithm when comparing characters.
const FORCED_MATCH_CHAR = '@'

const BOUNDARY_NODES = [
  'heading',
  'paragraph',
  'ordered_list',
  'unordered_list',
  'box'
]

// : (Fragment, Fragment, Change) → [Change]
export function computeDiff(fragA, fragB, range) {
  let tokA = tokens(fragA, range.fromA, range.toA, [])
  let tokB = tokens(fragB, range.fromB, range.toB, [])

  // We want to look at fenced nodes first and match them betwen A and B.
  // This way, we avoid changes spanning across fenced nodes that might have
  // the same text content.
  // For example: (diff start: →| , diff end: |←)
  //
  //  A                          B
  //  ---                        ---
  //  # February 10th, 2022      # February 17th, 2022
  //                             # February 10th, 2022
  //
  //  Would compute:
  //
  //  # February 1→|7th, 2022
  //  # February 1|←0th, 2022
  //
  //  Instead, we want it to compute:
  //
  //  →|# February 17th, 2022|←
  //  # February 10th, 2022
  //
  let fencedNodesA = findFencedNodes(tokA)
  let fencedNodesB = findFencedNodes(tokB)

  fencedNodesA.forEach(([xFrom, xTo, xHash]) => {
    const i = fencedNodesB.findIndex(([,, yHash]) => xHash === yHash)
    if (i > -1) {
      const sliced = fencedNodesB.splice(0, i + 1)
      const [yFrom, yTo, _] = sliced[sliced.length - 1]
      for (let xxFrom = xFrom, xxTo = xTo; xxFrom < tokA.length && xxFrom <= xxTo; xxFrom++) {
        tokA[xxFrom] = FORCED_MATCH_CHAR
      }
      for (let yyFrom = yFrom, yyTo = yTo; yyFrom <= yyTo; yyFrom++) {
        tokB[yyFrom] = FORCED_MATCH_CHAR
      }
    }
  })

  // Scan from both sides to cheaply eliminate work
  let start = 0,
    endA = tokA.length,
    endB = tokB.length
  while (start < tokA.length && start < tokB.length && tokA[start] === tokB[start]) start++
  if (start === tokA.length && start === tokB.length) return []
  while (endA > start && endB > start && tokA[endA - 1] === tokB[endB - 1]) endA--, endB--
  // If the result is simple _or_ too big to cheaply compute, return
  // the remaining region as the diff
  if (endA === start || endB === start || (endA === endB && endA === start + 1))
    return [range.slice(start, endA, start, endB)]

  // This is an implementation of Myers' diff algorithm
  // See https://neil.fraser.name/writing/diff/myers.pdf and
  // https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/

  let n = endA - start
  let m = endB - start
  let max = n + m
  let off = max + 1
  let trace = []
  let v = new Array(off * 2).fill(-1)

  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      /*
         The order of the elements in the array does not matter, the index, value
         pairs are what we care about. In order to be able to store the negative values
         for k in the indices, offset by max
       */
      let next = v[k + 1 + max]
      let prev = v[k - 1 + max]
      let x = next < prev ? prev : next + 1
      let y = x + k

      /*
         walk all diagonals since they are free.
         Diagonals occur when the tokens match, walking a diagonal increases x and y
       */
      while (x < n && y < m && tokA[start + x] === tokB[start + y]) {
        x++
        y++
      }

      v[k + max] = x

      // Found a match
      if (x >= n && y >= m) {
        // Trace back through the history to build up a set of changed ranges.
        let diff = [],
          minSpan = minUnchanged(endA - start, endB - start)
        // Used to add steps to a diff one at a time, back to front, merging
        // ones that are less than minSpan tokens apart
        let fromA = -1,
          toA = -1,
          fromB = -1,
          toB = -1

        let add = (fA, tA, fB, tB) => {
          if (fromA > -1 && fromA < tA + minSpan) {
            const gapSlice = tokA.slice(tA, fromA)
            if (gapSlice.includes(-1) && fA !== tA) {
              diff.push(range.slice(fromA, toA, fromB, toB))
              fromA = fA
              toA = tA
              fromB = fB
              toB = tB
            } else {
              fromA = fA
              fromB = fB
            }
          } else {
            if (fromA > -1) {
              diff.push(range.slice(fromA, toA, fromB, toB))
            }
            fromA = fA
            toA = tA
            fromB = fB
            toB = tB
          }
        }

        for (let i = d - 1; i >= 0; i--) {
          let next = v[k + 1 + max],
            prev = v[k - 1 + max]
          if (next < prev) {
            // Deletion, resulting in an insertion
            k--
            x = prev + start
            y = x + k
            add(x, x, y, y + 1)
          } else {
            // Insertion, resulting in a deletion
            k++
            x = next + start
            y = x + k
            add(x, x + 1, y, y)
          }
          v = trace[i >> 1]
        }

        if (fromA > -1) {
          diff.push(range.slice(fromA, toA, fromB, toB))
        }

        return diff.reverse()
      }
    }
    // Since only either odd or even diagonals are read from each
    // frontier, we only copy them every other iteration.
    if (d % 2 === 0) trace.push(v.slice())
  }
  // The loop exited, meaning the maximum amount of work was done.
  // Just return a change spanning the entire range.
  return [range.slice(start, endA, start, endB)]
}
