// ::- A document range with metadata associated with it. Used to
// track both inserted and deleted ranges, though deletions are
// represented with a subclass.
export class Span {
  constructor(from, to, data) {
    // :: number
    this.from = from
    // :: number
    this.to = to
    // :: any
    this.data = data
  }
}

// :: ([Span], number, number, string) → [Span]
// Updates an array of spans by adding a new one to it. Spans with
// different authors are kept separate. When the new span touches
// spans with the same author, it is joined with them. When it
// overlaps with spans with different authors, it overwrites those
// parts.
export function addSpan(spans, from, to, data, compare, combine) {
  return addSpanInner(spans, from, to, data, compare, combine, true)
}

export function addSpanBelow(spans, from, to, data, compare, combine) {
  return addSpanInner(spans, from, to, data, compare, combine, false)
}

export function addSpanInner(spans, from, to, data, compare, combine, above) {
  let inserted = null

  for (let i = 0; i < spans.length; i++) {
    let span = spans[i], compat = compare(span.data, data)
    if (compat ? span.to < from : span.to <= from) {
      // Not there yet
    } else if (compat ? span.from > to : span.from >= to) {
      if (!inserted) spans.splice(i, 0, inserted = new Span(from, to, data))
      break
    } else if (compat) {
      from = Math.min(from, span.from)
      to = Math.max(to, span.to)
      data = combine(span.data, data)
      spans.splice(i--, 1)
    } else if (above) { // New span overwrites existing ones
      if (span.from < from) spans.splice(i++, 0, new Span(span.from, from, span.data))
      if (span.to > to) {
        spans.splice(i, 1, inserted = new Span(from, to, data), new Span(to, span.to, span.data))
        break
      } else {
        spans.splice(i--, 1)
      }
    } else { // New span only appears behind existing ones
      if (from < span.from) spans.splice(i++, 0, new Span(from, span.from, data))
      if (to <= span.to) {
        inserted = true
        break
      } else {
        from = span.to
      }
    }
  }
  if (!inserted) spans.push(new Span(from, to, data))
  return spans
}

