const ist = require("ist")
const {schema, doc, p} = require("prosemirror-test-builder")
const {Transform, Mapping} = require("prosemirror-transform")

const {ChangeSet} = require("../src/changeset")

describe("ChangeSet", () => {
  it("finds a single insertion",
     find(doc(p("he<a>llo")), (tr, p) => tr.insert(p("a"), schema.text("XY")), {a: 2}))

  it("finds a single deletion",
     find(doc(p("he<a>ll<b>o")), (tr, p) => tr.delete(p("a"), p("b")), null, {a: "ll"}))

  it("identifies a replacement",
     find(doc(p("he<a>ll<b>o")), (tr, p) => tr.replaceWith(p("a"), p("b"), schema.text("juj")), {a: 3}, {a: "ll"}))

  it("merges adjacent canceling edits",
     find(doc(p("he<a>ll<b>o")), (tr, p) => tr.delete(p("a"), p("b")).insert(p("a"), schema.text("ll"))))

  it("partially merges insert at start",
     find(doc(p("he<a>l<b>L<c>o")), (tr, p) => tr.delete(p("a"), p("c")).insert(p("a"), schema.text("l")), null, {4: "L"}))

  it("partially merges insert at end",
     find(doc(p("he<a>lL<b>o")), (tr, p) => tr.delete(p("a"), p("b")).insert(p("a"), schema.text("L")), null, {3: "l"}))

  it("partially merges delete at start",
     find(doc(p("ab<a>c")), (tr, p) => tr.insert(p("a"), schema.text("xyz")).delete(p("a"), p("a") + 1), {a: 2}))

  it("partially merges delete at end",
     find(doc(p("ab<a>c")), (tr, p) => tr.insert(p("a"), schema.text("xyz")).delete(p("a", 1) - 1, p("a", 1)), {3: 2}))

  it("finds multiple insertions",
     find(doc(p("<a>abc<b>")), (tr, p) => tr.insert(p("a"), schema.text("x")).insert(p("b"), schema.text("y")), {a: 1, b: 1}))

  it("finds multiple deletions",
     find(doc(p("<a>x<b>y<c>z<d>")), (tr, p) => tr.delete(p("a"), p("b")).delete(p("c"), p("d")), null, {a: "x", c: "z"}))

  it("identifies a deletion between insertions",
     find(doc(p("z<a>y<b>z")), (tr, p) => tr.insert(p("a"), schema.text("A")).insert(p("b"), schema.text("B")).delete(p("a", 1), p("b")),
          {a: 2}, {a: "y"}))

  it("can add a deletion in a new addStep call", find(doc(p("h<a>e<b>l<c>l<d>o")), [
    (tr, p) => tr.delete(p("a"), p("b")),
    (tr, p) => tr.delete(p("c"), p("d"))
  ], null, {a: "e", c: "l"}))

  it("merges delete/insert from different addStep calls", find(doc(p("he<a>ll<b>o")), [
    (tr, p) => tr.delete(p("a"), p("b")),
    (tr, p) => tr.insert(p("a"), schema.text("ll"))
  ]))

  it("partially merges delete/insert from different addStep calls", find(doc(p("he<a>lj<b>o")), [
    (tr, p) => tr.delete(p("a"), p("b")),
    (tr, p) => tr.insert(p("a"), schema.text("ll"))
  ], {4: 1}, {4: "j"}))

  it("merges insert/delete from different addStep calls", find(doc(p("o<a>k")), [
    (tr, p) => tr.insert(p("a"), schema.text("--")),
    (tr, p) => tr.delete(p("a"), p("a", 1))
  ]))

  it("partially merges insert/delete from different addStep calls", find(doc(p("o<a>k")), [
    (tr, p) => tr.insert(p("a"), schema.text("--")),
    (tr, p) => tr.delete(p("a"), p("a") + 1)
  ], {a: 1}))
})

function find(doc, build, insertions, deletions, sep) {
  return () => {
    let set = ChangeSet.create(doc), mapping = new Mapping, curDoc = doc
    if (!Array.isArray(build)) build = [build]
    build.forEach((build, i) => {
      let tr = new Transform(curDoc)
      build(tr, (name, assoc=-1) => tr.mapping.map(mapping.map(doc.tag[name], assoc), assoc))
      set = set.addSteps(tr.doc, tr.mapping.maps, sep ? i : 0)
      mapping.appendMapping(tr.mapping)
      curDoc = tr.doc
    })

    let {deleted, inserted} = set

    let delKeys = Object.keys(deletions || {}), insKeys = Object.keys(insertions || {})
    ist(inserted.length, insKeys.length)
    ist(deleted.length, delKeys.length)

    insKeys.forEach((name, i) => {
      let pos = /\D/.test(name) ? mapping.map(doc.tag[name], -1) : +name
      let {from, to} = inserted[i]
      ist(from, pos)
      ist(to, pos + insertions[name])
    })

    delKeys.forEach((name, i) => {
      let {pos, slice: {content}} = deleted[i]
      ist(pos, /\D/.test(name) ? mapping.map(doc.tag[name], -1) : +name)
      ist(content.textBetween(0, content.size), deletions[name])
    })
  }
}
