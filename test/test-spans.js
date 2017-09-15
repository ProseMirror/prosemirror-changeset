// Some tests for addSpan

const {Span, addSpan} = require("../src/span.js")
const ist = require("ist")

function changes(val) {
  return Array.isArray(val) ? val.map(change) : [change(val)]
}

function change(str) {
  return {author: /^[^-]+/.exec(str)[0], id: +(/\d*$/.exec(str)[0] || 0)}
}

function spans(spec) {
  let result = []
  for (let i = 0; i < spec.length; i += 3)
    result.push(new Span(spec[i], spec[i + 1], changes(spec[i + 2])))
  return result
}

function add(start, add, result) {
  return () => {
    let out = addSpan(spans(start), add[0], add[1], change(add[2]))
    ist(JSON.stringify(out), JSON.stringify(spans(result)))
  }
}

describe("addSpan", () => {
  it("separate",
     add([0, 1, "a", 4, 5, "b"], [2, 3, "c"],
         [0, 1, "a", 2, 3, "c", 4, 5, "b"]))

  it("at end",
     add([0, 1, "a"], [2, 3, "b"],
         [0, 1, "a", 2, 3, "b"]))

  it("join same",
     add([0, 2, "a-1"], [1, 3, "a-2"],
         [0, 3, ["a-1", "a-2"]]))

  it("join same after",
     add([1, 3, "a-1"], [0, 2, "a-2"],
         [0, 3, ["a-1", "a-2"]]))

  it("join same touch",
     add([0, 1, "a-1"], [1, 3, "a-2"],
         [0, 3, ["a-1", "a-2"]]))

  it("join same touch after",
     add([1, 3, "a-1"], [0, 1, "a-2"],
         [0, 3, ["a-1", "a-2"]]))

  it("join two inside",
     add([0, 2, "a-1", 4, 6, "a-2"], [1, 5, "a-3"],
         [0, 6, ["a-2", "a-1", "a-3"]]))

  it("join two outside",
     add([1, 2, "a-1", 4, 6, "a-2"], [0, 8, "a-3"],
         [0, 8, ["a-2", "a-1", "a-3"]]))

  it("join three",
     add([0, 2, "a-1", 4, 6, "a-2", 8, 9, "a-3"], [1, 10, "a-4"],
         [0, 10, ["a-3", "a-2", "a-1", "a-4"]]))

  it("after other",
     add([0, 2, "a"], [2, 4, "b"],
         [0, 2, "a", 2, 4, "b"]))

  it("before other",
     add([2, 4, "b"], [0, 2, "a"],
         [0, 2, "a", 2, 4, "b"]))

  it("over other left",
     add([2, 4, "b"], [0, 3, "a"],
         [0, 3, "a", 3, 4, "b"]))

  it("over other right",
     add([0, 3, "a"], [2, 4, "b"],
         [0, 2, "a", 2, 4, "b"]))

  it("over other full",
     add([2, 3, "a"], [1, 4, "b"],
         [1, 4, "b"]))

  it("over other precise",
     add([2, 3, "a"], [2, 3, "b"],
         [2, 3, "b"]))

  it("split other",
     add([0, 5, "a"], [1, 3, "b"],
         [0, 1, "a", 1, 3, "b", 3, 5, "a"]))
})
