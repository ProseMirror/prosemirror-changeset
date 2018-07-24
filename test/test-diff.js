const ist = require("ist")
const {schema, doc, p} = require("prosemirror-test-builder")

const {computeDiff} = require("..")

describe("computeDiff", () => {
  function test(doc1, doc2, ...ranges) {
    let diff = computeDiff(doc1.content, doc2.content, 0, doc1.content.size, doc2.content.size)
    ist(JSON.stringify(diff.map(r => [r.fromA, r.toA, r.fromB, r.toB])), JSON.stringify(ranges))
  }

  it("returns an empty diff for identical documents", () =>
     test(doc(p("foo"), p("bar")), doc(p("foo"), p("bar"))))

  it("finds single-letter changes", () =>
     test(doc(p("foo"), p("bar")), doc(p("foa"), p("bar")),
          [3, 4, 3, 4]))

  it("finds simple structure changes", () =>
     test(doc(p("foo"), p("bar")), doc(p("foobar")),
          [4, 6, 4, 4]))

  it("finds multiple changes", () =>
     test(doc(p("foo"), p("bar")), doc(p("fgo"), p("bur")),
          [2, 3, 2, 3], [7, 8, 7, 8]))

  it("ignores single-letter unchanged parts", () =>
     test(doc(p("abcdef")), doc(p("axydzf")), [2, 6, 2, 6]))

  it("finds deletions", () =>
     test(doc(p("abc"), p("def")), doc(p("ac"), p("d")),
          [2, 3, 2, 2], [7, 9, 6, 6]))
})
