const ist = require("ist")
const {schema, doc, p, em, strong, h1, h2} = require("prosemirror-test-builder")

const {computeDiff} = require("..")

describe("computeDiff", () => {
  function test(doc1, doc2, ...ranges) {
    let diff = computeDiff(doc1.content, 0, doc1.content.size, doc2.content, 0, doc2.content.size)
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

  it("ignores marks", () =>
     test(doc(p("abc")), doc(p(em("a"), strong("bc")))))

  it("ignores marks in diffing", () =>
     test(doc(p("abcdefghi")), doc(p(em("x"), strong("bc"), "defgh", em("y"))),
          [1, 2, 1, 2], [9, 10, 9, 10]))

  it("ignores attributes", () =>
     test(doc(h1("x")), doc(h2("x"))))

  it("doesn't compute huge diffs", () =>
     test(doc(p("a" + "x".repeat(1000) + "b")), doc(p("b" + "x".repeat(1000) + "a")),
          [1, 1003, 1, 1003]))

  it("finds huge deletions", () =>
     test(doc(p("abbc")), doc(p("a" + "x".repeat(500) + "bb" + "x".repeat(500) + "c")),
          [2, 2, 2, 502], [4, 4, 504, 1004]))

  it("finds huge insertions", () =>
     test(doc(p("a" + "x".repeat(500) + "bb" + "x".repeat(500) + "c")), doc(p("abbc")),
          [2, 502, 2, 2], [504, 1004, 4, 4]))

  it("can handle ambiguous diffs", () =>
     test(doc(p("abcbcd")), doc(p("abcd")), [4, 6, 4, 4]))
})
