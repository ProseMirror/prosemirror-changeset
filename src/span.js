// ::- A document range with metadata associated with it. Used to
// track both inserted and deleted ranges, though deletions are
// represented with a subclass.
export class Span {
  constructor(from, to, data) {
    // :: number The start of this span.
    this.from = from
    // :: number The end of the span.
    this.to = to
    // :: any Data associated with this span.
    this.data = data
  }
}

// : ([Span], number, number, any, {compare: (any, any) → bool, combine: (any, any) → any}) → [Span]
// Updates an array of spans by adding a new one to it. Spans with
// different authors are kept separate. When the new span touches
// compatible (as per `config.compare` spans), it is joined with them.
// When it overlaps with incompatible spans, it overwrites those
// parts.
export function addSpan(spans, from, to, data, config) {
  return addSpanInner(spans, from, to, data, config, true)
}

// : ([Span], number, number, any, {compare: (any, any) → bool, combine: (any, any) → any}) → [Span]
// Works like `addSpan`, but leaves overlapping spans in the existing
// data intact, shrinking/splitting the new span instead.
export function addSpanBelow(spans, from, to, data, config) {
  return addSpanInner(spans, from, to, data, config, false)
}

export function addSpanInner(spans, from, to, data, config, above) {
  let inserted = null

  for (let i = 0; i < spans.length; i++) {
    let span = spans[i], compat = config.compare(span.data, data)
    if (compat ? span.to < from : span.to <= from) {
      // Not there yet
    } else if (compat ? span.from > to : span.from >= to) {
      if (!inserted) spans.splice(i, 0, inserted = new Span(from, to, data))
      break
    } else if (compat) {
      from = Math.min(from, span.from)
      to = Math.max(to, span.to)
      data = config.combine(span.data, data)
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

