// Some tests for addSpan

const {Span, addSpan, addSpanBelow} = require("../src/span.js")
const ist = require("ist")

function data(str) {
  let m = /(\w+)(?:-([\d,]+))?/.exec(str)
  return {author: m[1], ids: m[2] ? m[2].split(",") : [0]}
}

let config = {
  compare(d1, d2) { return d1.author == d2.author },
  combine(d1, d2) {
    let ids = d1.ids.concat()
    for (let i = 0; i < d2.ids.length; i++) if (ids.indexOf(d2.ids[i]) < 0) ids.push(d2.ids[i])
    return {author: d1.author, ids}
  }
}

function spans(spec) {
  let result = []
  for (let i = 0; i < spec.length; i += 3)
    result.push(new Span(spec[i], spec[i + 1], data(spec[i + 2])))
  return result
}

function add(start, add, result) {
  return () => {
    let out = addSpan(spans(start), add[0], add[1], data(add[2]), config)
    ist(JSON.stringify(out), JSON.stringify(spans(result)))
  }
}

function addB(start, add, result) {
  return () => {
    let out = addSpanBelow(spans(start), add[0], add[1], data(add[2]), config)
    ist(JSON.stringify(out), JSON.stringify(spans(result)))
  }
}

describe("addSpan", () => {
  it("can insert a span",
     add([0, 1, "a", 4, 5, "b"], [2, 3, "c"],
         [0, 1, "a", 2, 3, "c", 4, 5, "b"]))

  it("can insert a span at the end",
     add([0, 1, "a"], [2, 3, "b"],
         [0, 1, "a", 2, 3, "b"]))

  it("can join overlapping spans",
     add([0, 2, "a-1"], [1, 3, "a-2"],
         [0, 3, "a-1,2"]))

  it("can join an overlapping span when extending after it",
     add([1, 3, "a-1"], [0, 2, "a-2"],
         [0, 3, "a-1,2"]))

  it("can join spans when inserted directly before",
     add([0, 1, "a-1"], [1, 3, "a-2"],
         [0, 3, "a-1,2"]))

  it("can join spans when inserted directly after",
     add([1, 3, "a-1"], [0, 1, "a-2"],
         [0, 3, "a-1,2"]))

  it("can join two spans by filling the space between",
     add([0, 2, "a-1", 4, 6, "a-2"], [1, 5, "a-3"],
         [0, 6, "a-2,1,3"]))

  it("can join two spans by covering them",
     add([1, 2, "a-1", 4, 6, "a-2"], [0, 8, "a-3"],
         [0, 8, "a-2,1,3"]))

  it("can join three spans",
     add([0, 2, "a-1", 4, 6, "a-2", 8, 9, "a-3"], [1, 10, "a-4"],
         [0, 10, "a-3,2,1,4"]))

  it("can insert after another span",
     add([0, 2, "a"], [2, 4, "b"],
         [0, 2, "a", 2, 4, "b"]))

  it("can insert before another span",
     add([2, 4, "b"], [0, 2, "a"],
         [0, 2, "a", 2, 4, "b"]))

  it("can cover the left side of another psan",
     add([2, 4, "b"], [0, 3, "a"],
         [0, 3, "a", 3, 4, "b"]))

  it("can cover the right part of another span",
     add([0, 3, "a"], [2, 4, "b"],
         [0, 2, "a", 2, 4, "b"]))

  it("can cover another span entirely",
     add([2, 3, "a"], [1, 4, "b"],
         [1, 4, "b"]))

  it("can precisely cover another span",
     add([2, 3, "a"], [2, 3, "b"],
         [2, 3, "b"]))

  it("can split split other spans",
     add([0, 5, "a"], [1, 3, "b"],
         [0, 1, "a", 1, 3, "b", 3, 5, "a"]))

  it("can add a span behind others",
     addB([1, 2, "a", 3, 4, "b"], [0, 8, "c"],
          [0, 1, "c", 1, 2, "a", 2, 3, "c", 3, 4, "b", 4, 8, "c"]))

  it("joins spans inserted behind",
     addB([1, 2, "a", 3, 4, "b"], [0, 8, "b"],
          [0, 1, "b", 1, 2, "a", 2, 8, "b"]))

  it("can add a span behind directly adjacent spans",
     addB([1, 2, "a", 3, 4, "b"], [2, 3, "c"],
          [1, 2, "a", 2, 3, "c", 3, 4, "b"]))
})
