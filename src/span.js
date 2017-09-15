// ::- A document range with an author assigned to it. Used to track
// both inserted and deleted ranges internally, but only the inserted
// ranges are returned as spans.
export class Span {
  constructor(from, to, changes) {
    // :: number
    this.from = from
    // :: number
    this.to = to
    // :: [Change}
    this.changes = changes
  }

  get author() {
    return this.changes[0].author
  }
}

export function join(setA, setB) {
  let result
  for (let i = 0; i < setB.length; i++) if (setA.indexOf(setB[i]) == -1)
    (result || (result = setA.slice())).push(setB[i])
  return result || setA
}

// :: ([Span], number, number, string) → [Span]
// Updates an array of spans by adding a new one to it. Spans with
// different authors are kept separate. When the new span touches
// spans with the same author, it is joined with them. When it
// overlaps with spans with different authors, it overwrites those
// parts.
export function addSpan(spans, from, to, change) {
  let pos = 0, next
  for (; pos < spans.length; pos++) {
    next = spans[pos]
    if (next.author == change.author) {
      if (next.to >= from) break
    } else if (next.to > from) { // Different author, not before
      if (next.from < from) { // Sticks out to the left (loop below will handle right side)
        let left = new Span(next.from, from, next.changes)
        if (next.to > to) spans.splice(pos++, 0, left)
        else spans[pos++] = left
      }
      break
    }
  }

  let changes = [change]
  while (next = spans[pos]) {
    if (next.author == change.author) {
      if (next.from > to) break
      from = Math.min(from, next.from)
      to = Math.max(to, next.to)
      changes = join(next.changes, changes)
      spans.splice(pos, 1)
    } else {
      if (next.from >= to) break
      if (next.to > to) {
        spans[pos] = new Span(to, next.to, next.changes)
        break
      } else {
        spans.splice(pos, 1)
      }
    }
  }

  spans.splice(pos, 0, new Span(from, to, changes))
  return spans
}
