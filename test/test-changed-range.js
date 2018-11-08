const ist = require("ist")
const {schema, doc, p, blockquote, h1} = require("prosemirror-test-builder")
const {Transform, Mapping} = require("prosemirror-transform")

const {ChangeSet} = require("..")

function mk(doc, change) {
  let tr = change(new Transform(doc))
  let data = new Array(tr.steps.length).fill("a")
  let set0 = ChangeSet.create(doc)
  return {doc0: doc, tr, data, set0,
          set: set0.addSteps(tr.doc, tr.mapping.maps, data)}
}

function same(a, b) {
  ist(JSON.stringify(a), JSON.stringify(b))
}

describe("ChangeSet.changedRange", () => {
  it("returns null for identical sets", () => {
    let {set, doc0, tr, data} = mk(doc(p("foo")), tr => tr
                                   .replaceWith(2, 3, schema.text("aaaa"))
                                   .replaceWith(1, 1, schema.text("xx"))
                                   .delete(5, 7))
    ist(set.changedRange(set), null)
    ist(set.changedRange(ChangeSet.create(doc0).addSteps(tr.doc, tr.mapping.maps, data)), null)
  })

  it("returns only the changed range in simple cases", () => {
    let {set0, set, tr} = mk(doc(p("abcd")), tr => tr.replaceWith(2, 4, schema.text("u")))
    same(set0.changedRange(set, tr.mapping.maps), {from: 2, to: 3})
  })

  it("includes precise extent of the changes when spans are compatible", () => {
    let {set0, set, tr, doc0} = mk(doc(p("abcd")), tr => tr.replaceWith(5, 5, schema.text("fg"))
                             .replaceWith(5, 5, schema.text("e")))
    let set1 = ChangeSet.create(doc0).addSteps(tr.docs[1], [tr.mapping.maps[0]], ["a"])
    same(set0.changedRange(set1, [tr.mapping.maps[0]]), {from: 5, to: 7})
    same(set1.changedRange(set, [tr.mapping.maps[1]]), {from: 5, to: 6})
  })

  it("expands to cover updated spans", () => {
    let {doc0, set0, set, tr} = mk(doc(p("abcd")), tr => tr
                                   .replaceWith(2, 2, schema.text("c"))
                                   .delete(3, 5))
    let set1 = ChangeSet.create(doc0).addSteps(tr.docs[1], [tr.mapping.maps[0]], ["a"])
    same(set0.changedRange(set1, [tr.mapping.maps[0]]), {from: 2, to: 3})
    same(set1.changedRange(set, [tr.mapping.maps[1]]), {from: 2, to: 3})
  })

  it("detects changes in deletions", () => {
    let {set} = mk(doc(p("abc")), tr => tr.delete(2, 3))
    same(set.changedRange(set.map(() => "b", () => "b")), {from: 2, to: 2})
  })
})
