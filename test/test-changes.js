const ist = require("ist")
const {schema, doc, p, blockquote, h1} = require("prosemirror-test-builder")
const {Transform, Mapping} = require("prosemirror-transform")

const {ChangeSet} = require("..")

describe("ChangeSet", () => {
  it("finds a single insertion",
     find(doc(p("he<a>llo")), (tr, pos) => tr.insert(pos("a"), schema.text("XY")), {a: 2}))

  it("finds a single deletion",
     find(doc(p("he<a>ll<b>o")), (tr, pos) => tr.delete(pos("a"), pos("b")), null, {a: "ll"}))

  it("identifies a replacement",
     find(doc(p("he<a>ll<b>o")), (tr, pos) => tr.replaceWith(pos("a"), pos("b"), schema.text("juj")), {a: 3}, {a: "ll"}))

  it("merges adjacent canceling edits",
     find(doc(p("he<a>ll<b>o")), (tr, pos) => tr.delete(pos("a"), pos("b")).insert(pos("a"), schema.text("ll"))))

  it("doesn't crash when cancelling edits are followed by others",
     find(doc(p("h<a>e<b>ll<c>o<d>")),
          (tr, pos) => tr.delete(pos("a"), pos("b")).insert(pos("a"), schema.text("e")).delete(pos("c"), pos("d")),
          null, {c: "o"}))

  it("stops handling an inserted span after collapsing it",
     find(doc(p("a<a>bcb<b>a")),
          (tr, pos) => tr.insert(pos("a"), schema.text("b")).insert(pos("b"), schema.text("b")).delete(pos("a", 1), pos("b", -1)),
          null, {3: "c"}))

  it("partially merges insert at start",
     find(doc(p("he<a>l<b>L<c>o")), (tr, pos) => tr.delete(pos("a"), pos("c")).insert(pos("a"), schema.text("l")), null, {4: "L"}))

  it("partially merges insert at end",
     find(doc(p("he<a>lL<b>o")), (tr, pos) => tr.delete(pos("a"), pos("b")).insert(pos("a"), schema.text("L")), null, {3: "l"}))

  it("partially merges delete at start",
     find(doc(p("ab<a>c")), (tr, pos) => tr.insert(pos("a"), schema.text("xyz")).delete(pos("a"), pos("a") + 1), {a: 2}))

  it("partially merges delete at end",
     find(doc(p("ab<a>c")), (tr, pos) => tr.insert(pos("a"), schema.text("xyz")).delete(pos("a", 1) - 1, pos("a", 1)), {3: 2}))

  it("finds multiple insertions",
     find(doc(p("<a>abc<b>")), (tr, pos) => tr.insert(pos("a"), schema.text("x")).insert(pos("b"), schema.text("y")), {a: 1, b: 1}))

  it("finds multiple deletions",
     find(doc(p("<a>x<b>y<c>z<d>")), (tr, pos) => tr.delete(pos("a"), pos("b")).delete(pos("c"), pos("d")), null, {a: "x", c: "z"}))

  it("identifies a deletion between insertions",
     find(doc(p("z<a>y<b>z")), (tr, pos) => tr.insert(pos("a"), schema.text("A")).insert(pos("b"), schema.text("B")).delete(pos("a", 1), pos("b")),
          {a: 2}, {a: "y"}))

  it("can add a deletion in a new addStep call", find(doc(p("h<a>e<b>l<c>l<d>o")), [
    (tr, pos) => tr.delete(pos("a"), pos("b")),
    (tr, pos) => tr.delete(pos("c"), pos("d"))
  ], null, {a: "e", c: "l"}))

  it("merges delete/insert from different addStep calls", find(doc(p("he<a>ll<b>o")), [
    (tr, pos) => tr.delete(pos("a"), pos("b")),
    (tr, pos) => tr.insert(pos("a"), schema.text("ll"))
  ]))

  it("partially merges delete/insert from different addStep calls", find(doc(p("he<a>lj<b>o")), [
    (tr, pos) => tr.delete(pos("a"), pos("b")),
    (tr, pos) => tr.insert(pos("a"), schema.text("ll"))
  ], {4: 1}, {4: "j"}))

  it("merges insert/delete from different addStep calls", find(doc(p("o<a>k")), [
    (tr, pos) => tr.insert(pos("a"), schema.text("--")),
    (tr, pos) => tr.delete(pos("a"), pos("a", 1))
  ]))

  it("partially merges insert/delete from different addStep calls", find(doc(p("o<a>k")), [
    (tr, pos) => tr.insert(pos("a"), schema.text("--")),
    (tr, pos) => tr.delete(pos("a"), pos("a") + 1)
  ], {a: 1}))

  it("maps deletions forward", find(doc(p("f<a>ooba<b>r<c>")), [
    (tr, pos) => tr.delete(pos("b"), pos("c")),
    (tr, pos) => tr.insert(pos("a"), schema.text("OKAY"))
  ], {a: 4}, {b: "r"}))

  it("can incrementally undo then redo", find(doc(p("b<a>a<b>r")), [
    (tr, pos) => tr.delete(pos("a"), pos("b")),
    (tr, pos) => tr.insert(pos("a"), schema.text("a")),
    (tr, pos) => tr.delete(pos("a"), pos("a") + 1)
  ], null, {a: "a"}))

  it("can map through complicated changesets", find(doc(p("12345678901234")), [
    tr => tr.delete(9, 12).insert(6, schema.text("xyz")).replaceWith(2, 3, schema.text("uv")),
    tr => tr.delete(14, 15).insert(13, schema.text("90")).delete(8, 9)
  ], {2: 2, 7: 2}, {2: "2", 14: "1", 15: "3"}))

  it("computes a proper diff of the changes",
     find(doc(p("abcd"), p("efgh")),
          tr => tr.delete(2, 10).insert(2, schema.text("cdef")),
          null, {2: "b", 4: "", 6: "g"}))

  it("handles re-adding content step by step", find(doc(p("one two three")), [
    tr => tr.delete(1, 14),
    tr => tr.insert(1, schema.text("two")),
    tr => tr.insert(4, schema.text(" ")),
    tr => tr.insert(5, schema.text("three"))
  ], null, {1: "one "}))

  it("doesn't get confused by split deletions", find(doc(blockquote(h1("one"), p("two three"))), [
    tr => tr.delete(7, 11),
    tr => tr.replaceWith(0, 14, blockquote(h1("one"), p("three")))
  ], null, {7: "two "}, true))

  it("doesn't get confused by multiply split deletions", find(doc(blockquote(h1("one"), p("two three"))), [
    tr => tr.delete(14, 16),
    tr => tr.delete(7, 11),
    tr => tr.delete(3, 5),
    tr => tr.replaceWith(0, 10, blockquote(h1("o"), p("thr")))
  ], null, {3: "ne", 5: "two ", 8: "ee"}, true))

  it("won't lose the order of overlapping changes", find(doc(p("12345")), [
    tr => tr.delete(4, 5),
    tr => tr.replaceWith(2, 2, schema.text("a")),
    tr => tr.delete(1, 6),
    tr => tr.replaceWith(1, 1, schema.text("1a235"))
  ], {2: 1}, {5: "4"}, [0, 0, 1, 1]))

  it("properly maps deleted positions", find(doc(p("jTKqvPrzApX")), [
    tr => tr.delete(8, 11),
    tr => tr.replaceWith(1, 1, schema.text("MPu")),
    tr => tr.delete(2, 12),
    tr => tr.replaceWith(2, 2, schema.text("PujTKqvPrX"))
  ], {1: 3}, {11: "zAp"}, [1, 2, 2, 2]))

  it("fuzz issue 1", find(doc(p("hzwiKqBPzn")), [
    tr => tr.delete(3, 7),
    tr => tr.replaceWith(5, 5, schema.text("LH")),
    tr => tr.replaceWith(6, 6, schema.text("uE")),
    tr => tr.delete(1, 6),
    tr => tr.delete(3, 6)
  ], {1: 2}, [[1, "hz"], [1, "wiKq"], [1, "BP"], [1, "zn"]], [0, 1, 0, 1, 0]))

  it("fuzz issue 2", find(doc(p("eAMISWgauf")), [
    tr => tr.delete(5, 10),
    tr => tr.replaceWith(5, 5, schema.text("KkM")),
    tr => tr.replaceWith(3, 3, schema.text("UDO")),
    tr => tr.delete(1, 12),
    tr => tr.replaceWith(1, 1, schema.text("eAUDOMIKkMf")),
    tr => tr.delete(5, 8),
    tr => tr.replaceWith(3, 3, schema.text("qX"))
  ], {3: 7}, [[3, "MI"], [3, "SWgau"]], [2, 0, 0, 0, 0, 0, 0]))

  it("fuzz issue 3", find(doc(p("hfxjahnOuH")), [
    tr => tr.delete(1, 5),
    tr => tr.replaceWith(3, 3, schema.text("X")),
    tr => tr.delete(1, 8),
    tr => tr.replaceWith(1, 1, schema.text("ahXnOuH")),
    tr => tr.delete(2, 4),
    tr => tr.replaceWith(2, 2, schema.text("tn")),
    tr => tr.delete(5, 7),
    tr => tr.delete(1, 6),
    tr => tr.replaceWith(1, 1, schema.text("atnnH")),
    tr => tr.delete(2, 6)
  ], {1: 1}, [[1, "hfxj"], [1, "a"], [1, "h"], [1, "n"], [1, "Ou"], [1, "H"]], [1, 0, 1, 1, 1, 1, 1, 0, 0, 0]))
})

function find(doc, build, insertions, deletions, sep) {
  return () => {
    let set = ChangeSet.create(doc), mapping = new Mapping, curDoc = doc
    if (!Array.isArray(build)) build = [build]
    build.forEach((build, i) => {
      let tr = new Transform(curDoc)
      build(tr, (name, assoc=-1) => tr.mapping.map(mapping.map(doc.tag[name], assoc), assoc))
      set = set.addSteps(tr.doc, tr.mapping.maps, !sep ? 0 : Array.isArray(sep) ? sep[i] : i)
      mapping.appendMapping(tr.mapping)
      curDoc = tr.doc
    })

    let {deleted, inserted} = set
    ist(JSON.stringify(inserted.map(i => [i.from, i.to])),
        JSON.stringify(Object.keys(insertions || {}).map(k => {
          let pos = /\D/.test(k) ? mapping.map(doc.tag[k], -1) : +k
          return [pos, pos + insertions[k]]
        })))
    ist(JSON.stringify(deleted.map(d => [d.pos, d.slice.content.textBetween(0, d.slice.content.size)])),
        JSON.stringify(Array.isArray(deletions) ? deletions :
                       Object.keys(deletions || {}).map(k => [/\D/.test(k) ? mapping.map(doc.tag[k], -1) : +k, deletions[k]])))
  }
}
