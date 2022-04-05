'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var IGNORED_ATTRS = {
  blockId: true,
};

var IGNORED_MARKS = {
  comment: true,
};

var getMarksString = function (node) {
  var marksString = '';
  var keys = Object.keys(node.marks);
  keys.sort();
  for (var i = 0; i < keys.length; i++) {
    var mark = node.marks[keys[i]];

    if (IGNORED_MARKS[mark.type.name]) {
      continue
    }

    marksString += (keys[i]) + ":" + (mark.type.name);
  }

  return marksString
};

var getAttributesString = function (node) {
  var attrsString = '';
  var keys = Object.keys(node.attrs);
  keys.sort();
  for (var i = 0; i < keys.length; i++) {
    if (!IGNORED_ATTRS[keys[i]]) {
      attrsString += (keys[i]) + ":" + (node.attrs[keys[i]]);
    }
  }
  return attrsString
};

// Convert the given range of a fragment to tokens, where node open
// tokens are encoded as strings holding the node name, characters as
// their character code, and node close tokens as -1.
function tokens(frag, start, end, target) {
  for (var i = 0, off = 0; i < frag.childCount; i++) {
    var child = frag.child(i),
      endOff = off + child.nodeSize;
    var from = Math.max(off, start),
      to = Math.min(endOff, end);
    if (from < to) {
      if (child.isText) {
        for (var j = from; j < to; j++) { target.push(("" + (child.text.charCodeAt(j - off)) + (getMarksString(child)))); }
      } else if (child.isLeaf) {
        target.push(("" + (child.type.name) + (getAttributesString(child))));
      } else {
        if (from == off) { target.push(("" + (child.type.name) + (getAttributesString(child)))); }
        tokens(child.content, Math.max(off + 1, from) - off - 1, Math.min(endOff - 1, to) - off - 1, target);
        if (to == endOff) { target.push(-1); }
      }
    }
    off = endOff;
  }
  return target
}

// This obscure mess of constants computes the minimum length of an
// unchanged range (not at the start/end of the compared content). The
// idea is to make it higher in bigger replacements, so that you don't
// get a diff soup of coincidentally identical letters when replacing
// a paragraph.
function minUnchanged(sizeA, sizeB) {
  return Math.min(15, Math.max(2, Math.floor(Math.max(sizeA, sizeB) / 10)))
}

var FENCED_NODE_NAMES = [
  'heading'
];

// : ([string | number]) → [[number, number, string]]
// This function parses an array of tokens looking for ranges that represent a
// fenced nodes, and return a list of tuples with information about those
// nodes. Each tuple contains, in order:
// - the start position of the node
// - the end position of the node
// - a hash of the content of the node
function findFencedNodes(a) {
  var from = null;
  var to = null;
  var edges = [];
  var loop = function ( i, len ) {
    if (typeof a[i] === 'string' && FENCED_NODE_NAMES.some(function (nodeName) { return a[i].includes(nodeName); })) {
      from = i;
    }
    if (a[i] === -1) {
      to = i;
      edges.push([from, to]);
      from = null;
      to = null;
    }
  };

  for (var i = 0, len = a.length; i < len; i++) loop( i);
  return edges.reduce(function (acc, ref) {
    var from = ref[0];
    var to = ref[1];

    return acc.concat( [[from, to, a.slice(from, to + 1).join('-')]])
  }, [])
}

// This is the char we replace tokens of matching fenced nodes with. The only
// requirement is that it's not a charcode, so that we don't run the risk of
// getting in the way of the diff algorithm when comparing characters.
var FORCED_MATCH_CHAR = '@';

var BOUNDARY_NODES = [
  'heading',
  'paragraph',
  'ordered_list',
  'unordered_list',
  'box'
];

function splitInsertions(change, tok) {
  var fromB = change.fromB;
  var toB = change.toB;
  var fromA = change.fromA;
  var toA = change.toA;
  var depthCount = 0;
  var curFromA = 0;
  var curToA = toA - fromA;
  var curFromB = 0;
  var curToB = 0;
  var localDiff = [];

  tok.slice(fromB, toB).forEach(function (t) {
    curToB += 1;
    if (t !== -1 && BOUNDARY_NODES.some(function (nodeName) { return t.includes(nodeName); })) {
      //We found an opening token, increment the depth relative to the start of the change
      depthCount++;
    }
    if (t === -1) {
      depthCount--;
      if (Math.abs(depthCount) === 1 || depthCount === 0) {
        var slicedChange = change.slice(curFromA, curToA, curFromB, curToB);
        localDiff.push(slicedChange);
        curFromB = curToB;
        curFromA = curToA;
        curToA = curFromA;
      }
    }
  });
  if (curFromB !== curToB) {
    // push in remaining slice
    localDiff.push(change.slice(curFromA, curToA, curFromB, curToB));
  }
  return localDiff.length > 0 ? localDiff : [change]
}

// : (Fragment, Fragment, Change) → [Change]
function computeDiff(fragA, fragB, range, splitEnabled) {
  var tokA = tokens(fragA, range.fromA, range.toA, []);
  var tokB = tokens(fragB, range.fromB, range.toB, []);

  // We want to look at fenced nodes first and match them betwen A and B.
  // This way, we avoid changes spanning across fenced nodes that might have
  // the same text content.
  // For example: (diff start: →| , diff end: |←)
  //
  //  A                          B
  //  ---                        ---
  //  # February 10th, 2022      # February 17th, 2022
  //                             # February 10th, 2022
  //
  //  Would compute:
  //
  //  # February 1→|7th, 2022
  //  # February 1|←0th, 2022
  //
  //  Instead, we want it to compute:
  //
  //  →|# February 17th, 2022|←
  //  # February 10th, 2022
  //
  var fencedNodesA = findFencedNodes(tokA);
  var fencedNodesB = findFencedNodes(tokB);

  fencedNodesA.forEach(function (ref) {
    var xFrom = ref[0];
    var xTo = ref[1];
    var xHash = ref[2];

    var i = fencedNodesB.findIndex(function (ref) {
      var yHash = ref[2];

      return xHash === yHash;
    });
    if (i > -1) {
      var sliced = fencedNodesB.splice(0, i + 1);
      var ref$1 = sliced[sliced.length - 1];
      var yFrom = ref$1[0];
      var yTo = ref$1[1];
      ref$1[2];
      for (var xxFrom = xFrom, xxTo = xTo; xxFrom < tokA.length && xxFrom <= xxTo; xxFrom++) {
        tokA[xxFrom] = FORCED_MATCH_CHAR;
      }
      for (var yyFrom = yFrom, yyTo = yTo; yyFrom <= yyTo; yyFrom++) {
        tokB[yyFrom] = FORCED_MATCH_CHAR;
      }
    }
  });

  // Scan from both sides to cheaply eliminate work
  var start = 0,
    endA = tokA.length,
    endB = tokB.length;
  while (start < tokA.length && start < tokB.length && tokA[start] === tokB[start]) { start++; }
  if (start === tokA.length && start === tokB.length) { return [] }
  while (endA > start && endB > start && tokA[endA - 1] === tokB[endB - 1]) { endA--, endB--; }

  // This is an implementation of Myers' diff algorithm
  // See https://neil.fraser.name/writing/diff/myers.pdf and
  // https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/

  var n = endA - start;
  var m = endB - start;
  var max = n + m;
  var off = max + 1;
  var trace = [];
  var v = new Array(off * 2).fill(-1);

  for (var d = 0; d <= max; d++) {
    for (var k = -d; k <= d; k += 2) {
      /*
         The order of the elements in the array does not matter, the index, value
         pairs are what we care about. In order to be able to store the negative values
         for k in the indices, offset by max
       */
      var next = v[k + 1 + max];
      var prev = v[k - 1 + max];
      var x = next < prev ? prev : next + 1;
      var y = x + k;

      /*
         walk all diagonals since they are free.
         Diagonals occur when the tokens match, walking a diagonal increases x and y
       */
      while (x < n && y < m && tokA[start + x] === tokB[start + y]) {
        x++;
        y++;
      }

      v[k + max] = x;

      // Found a match
      if (x >= n && y >= m) {
        // Trace back through the history to build up a set of changed ranges.
        var diff = [],
          minSpan = minUnchanged(endA - start, endB - start);
        // Used to add steps to a diff one at a time, back to front, merging
        // ones that are less than minSpan tokens apart
        var fromA = -1,
          toA = -1,
          fromB = -1,
          toB = -1;

        var add = function (fA, tA, fB, tB) {
          if (fromA > -1 && fromA < tA + minSpan) {
            var gapSlice = tokA.slice(tA, fromA);
            if (gapSlice.includes(-1) && fA !== tA) {
              diff.push(range.slice(fromA, toA, fromB, toB));
              fromA = fA;
              toA = tA;
              fromB = fB;
              toB = tB;
            } else {
              fromA = fA;
              fromB = fB;
            }
          } else {
            if (fromA > -1) {
              diff.push(range.slice(fromA, toA, fromB, toB));
            }
            fromA = fA;
            toA = tA;
            fromB = fB;
            toB = tB;
          }
        };

        for (var i = d - 1; i >= 0; i--) {
          var next$1 = v[k + 1 + max],
            prev$1 = v[k - 1 + max];
          if (next$1 < prev$1) {
            // Deletion, resulting in an insertion
            k--;
            x = prev$1 + start;
            y = x + k;
            add(x, x, y, y + 1);
          } else {
            // Insertion, resulting in a deletion
            k++;
            x = next$1 + start;
            y = x + k;
            add(x, x + 1, y, y);
          }
          v = trace[i >> 1];
        }

        if (fromA > -1) {
          diff.push(range.slice(fromA, toA, fromB, toB));
        }

        diff.reverse();

        if (!splitEnabled) {
          return diff
        }

        // Do a second pass to split replacements in which the inserted content spans multiples nodes into
        // a single replacement plus one insertion for each root node inserted

        var splitDiff = [];

        diff.forEach(function (change) {
          // is it a replacement
          if (change.inserted.length > 0) {
            var splits = splitInsertions(change, tokB);
            splitDiff.push.apply(splitDiff, splits);
          } else {
            splitDiff.push(change);
          }
        });

        return splitDiff
      }
    }
    // Since only either odd or even diagonals are read from each
    // frontier, we only copy them every other iteration.
    if (d % 2 === 0) { trace.push(v.slice()); }
  }
  // The loop exited, meaning the maximum amount of work was done.
  // Just return a change spanning the entire range.
  return [range.slice(start, endA, start, endB)]
}

// ::- Stores metadata for a part of a change.
var Span = function Span(length, data) {
  // :: number
  this.length = length;
  // :: any
  this.data = data;
};

Span.prototype.cut = function cut (length) {
  return length == this.length ? this : new Span(length, this.data)
};

Span.prototype.toJSON = function toJSON () {
  return { length: this.length, data: this.data }
};

Span.fromJSON = function fromJSON (value) {
  return new Span(value.length, value.data)
};

Span.slice = function slice (spans, from, to) {
  if (from == to) { return Span.none }
  if (from == 0 && to == Span.len(spans)) { return spans }
  var result = [];
  for (var i = 0, off = 0; off < to; i++) {
    var span = spans[i],
      end = off + span.length;
    var overlap = Math.min(to, end) - Math.max(from, off);
    if (overlap > 0) { result.push(span.cut(overlap)); }
    off = end;
  }
  return result
};

Span.join = function join (a, b, combine) {
  if (a.length == 0) { return b }
  if (b.length == 0) { return a }
  var combined = combine(a[a.length - 1].data, b[0].data);
  if (combined == null) { return a.concat(b) }
  var result = a.slice(0, a.length - 1);
  result.push(new Span(a[a.length - 1].length + b[0].length, combined));
  for (var i = 1; i < b.length; i++) { result.push(b[i]); }
  return result
};

Span.len = function len (spans) {
  var len = 0;
  for (var i = 0; i < spans.length; i++) { len += spans[i].length; }
  return len
};

Span.none = [];

// ::- A replaced range with metadata associated with it.
var Change = function Change(fromA, toA, fromB, toB, deleted, inserted) {
  // :: number The start of the range deleted/replaced in the old
  // document.
  this.fromA = fromA;
  // :: number The end of the range in the old document.
  this.toA = toA;
  // :: number The start of the range inserted in the new document.
  this.fromB = fromB;
  // :: number The end of the range in the new document.
  this.toB = toB;
  // :: [Span] Data associated with the deleted content. The length
  // of these spans adds up to `this.toA - this.fromA`.
  this.deleted = deleted;
  // :: [Span] Data associated with the inserted content. Length
  // adds up to `this.toB - this.toA`.
  this.inserted = inserted;
};

var prototypeAccessors$1 = { lenA: { configurable: true },lenB: { configurable: true } };

prototypeAccessors$1.lenA.get = function () {
  return this.toA - this.fromA
};
prototypeAccessors$1.lenB.get = function () {
  return this.toB - this.fromB
};

Change.prototype.toJSON = function toJSON () {
  return {
    fromA: this.fromA,
    toA: this.toA,
    fromB: this.fromB,
    toB: this.toB,
    deleted: this.deleted.map(function (s) { return s.toJSON(); }),
    inserted: this.inserted.map(function (s) { return s.toJSON(); }),
  }
};

Change.fromJSON = function fromJSON (value) {
  return new Change(
    value.fromA,
    value.toA,
    value.fromB,
    value.toB,
    value.deleted.map(function (s) { return Span.fromJSON(s); }),
    value.inserted.map(function (s) { return Span.fromJSON(s); })
  )
};

Change.prototype.slice = function slice (startA, endA, startB, endB) {
  if (startA == 0 && startB == 0 && endA == this.toA - this.fromA && endB == this.toB - this.fromB) { return this }
  return new Change(
    this.fromA + startA,
    this.fromA + endA,
    this.fromB + startB,
    this.fromB + endB,
    Span.slice(this.deleted, startA, endA),
    Span.slice(this.inserted, startB, endB)
  )
};

// : ([Change], [Change], (any, any) → any) → [Change]
// This merges two changesets (the end document of x should be the
// start document of y) into a single one spanning the start of x to
// the end of y.
Change.merge = function merge (x, y, combine) {
  if (x.length == 0) { return y }
  if (y.length == 0) { return x }

  var result = [];
  // Iterate over both sets in parallel, using the middle coordinate
  // system (B in x, A in y) to synchronize.
  for (var iX = 0, iY = 0, curX = x[0], curY = y[0]; ; ) {
    if (!curX && !curY) {
      return result
    } else if (curX && (!curY || curX.toB < curY.fromA)) {
      // curX entirely in front of curY
      var off = iY ? y[iY - 1].toB - y[iY - 1].toA : 0;
      result.push(
        off == 0
          ? curX
          : new Change(curX.fromA, curX.toA, curX.fromB + off, curX.toB + off, curX.deleted, curX.inserted)
      );
      curX = iX++ == x.length ? null : x[iX];
    } else if (curY && (!curX || curY.toA < curX.fromB)) {
      // curY entirely in front of curX
      var off$1 = iX ? x[iX - 1].toB - x[iX - 1].toA : 0;
      result.push(
        off$1 == 0
          ? curY
          : new Change(curY.fromA - off$1, curY.toA - off$1, curY.fromB, curY.toB, curY.deleted, curY.inserted)
      );
      curY = iY++ == y.length ? null : y[iY];
    } else {
      // Touch, need to merge
      // The rules for merging ranges are that deletions from the
      // old set and insertions from the new are kept. Areas of the
      // middle document covered by a but not by b are insertions
      // from a that need to be added, and areas covered by b but
      // not a are deletions from b that need to be added.
      var pos = Math.min(curX.fromB, curY.fromA);
      var fromA = Math.min(curX.fromA, curY.fromA - (iX ? x[iX - 1].toB - x[iX - 1].toA : 0)),
        toA = fromA;
      var fromB = Math.min(curY.fromB, curX.fromB + (iY ? y[iY - 1].toB - y[iY - 1].toA : 0)),
        toB = fromB;
      var deleted = Span.none,
        inserted = Span.none;

      // Used to prevent appending ins/del range for the same Change twice
      var enteredX = false,
        enteredY = false;

      // Need to have an inner loop since any number of further
      // ranges might be touching this group
      for (;;) {
        var nextX = !curX ? 2e8 : pos >= curX.fromB ? curX.toB : curX.fromB;
        var nextY = !curY ? 2e8 : pos >= curY.fromA ? curY.toA : curY.fromA;
        var next = Math.min(nextX, nextY);
        var inX = curX && pos >= curX.fromB,
          inY = curY && pos >= curY.fromA;
        if (!inX && !inY) { break }
        if (inX && pos == curX.fromB && !enteredX) {
          deleted = Span.join(deleted, curX.deleted, combine);
          toA += curX.lenA;
          enteredX = true;
        }
        if (inX && !inY) {
          inserted = Span.join(inserted, Span.slice(curX.inserted, pos - curX.fromB, next - curX.fromB), combine);
          toB += next - pos;
        }
        if (inY && pos == curY.fromA && !enteredY) {
          inserted = Span.join(inserted, curY.inserted, combine);
          toB += curY.lenB;
          enteredY = true;
        }
        if (inY && !inX) {
          deleted = Span.join(deleted, Span.slice(curY.deleted, pos - curY.fromA, next - curY.fromA), combine);
          toA += next - pos;
        }

        if (inX && next == curX.toB) {
          curX = iX++ == x.length ? null : x[iX];
          enteredX = false;
        }
        if (inY && next == curY.toA) {
          curY = iY++ == y.length ? null : y[iY];
          enteredY = false;
        }
        pos = next;
      }
      if (fromA < toA || fromB < toB) { result.push(new Change(fromA, toA, fromB, toB, deleted, inserted)); }
    }
  }
};

Object.defineProperties( Change.prototype, prototypeAccessors$1 );

var letter;
// If the runtime support unicode properties in regexps, that's a good
// source of info on whether something is a letter.
try { letter = new RegExp("[\\p{Alphabetic}_]", "u"); } catch(_) {}

// Otherwise, we see if the character changes when upper/lowercased,
// or if it is part of these common single-case scripts.
var nonASCIISingleCaseWordChar = /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;

function isLetter(code) {
  if (code < 128)
    { return code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 79 && code <= 122 }
  var ch = String.fromCharCode(code);
  if (letter) { return letter.test(ch) }
  return ch.toUpperCase() != ch.toLowerCase() || nonASCIISingleCaseWordChar.test(ch)
}

// Convert a range of document into a string, so that we can easily
// access characters at a given position. Treat non-text tokens as
// spaces so that they aren't considered part of a word.
function getText(frag, start, end) {
  var out = "";
  function convert(frag, start, end) {
    for (var i = 0, off = 0; i < frag.childCount; i++) {
      var child = frag.child(i), endOff = off + child.nodeSize;
      var from = Math.max(off, start), to = Math.min(endOff, end);
      if (from < to) {
        if (child.isText) {
          out += child.text.slice(Math.max(0, start - off), Math.min(child.text.length, end - off));
        } else if (child.isLeaf) {
          out += " ";
        } else {
          if (from == off) { out += " "; }
          convert(child.content, Math.max(0, from - off - 1), Math.min(child.content.size, end - off));
          if (to == endOff) { out += " "; }
        }
      }
      off = endOff;
    }
  }
  convert(frag, start, end);
  return out
}

// The distance changes have to be apart for us to not consider them
// candidates for merging.
var MAX_SIMPLIFY_DISTANCE = 30;

// :: ([Change], Node) → [Change]
// Simplifies a set of changes for presentation. This makes the
// assumption that having both insertions and deletions within a word
// is confusing, and, when such changes occur without a word boundary
// between them, they should be expanded to cover the entire set of
// words (in the new document) they touch. An exception is made for
// single-character replacements.
function simplifyChanges(changes, doc) {
  var result = [];
  for (var i = 0; i < changes.length; i++) {
    var end = changes[i].toB, start = i;
    while (i < changes.length - 1 && changes[i + 1].fromB <= end + MAX_SIMPLIFY_DISTANCE)
      { end = changes[++i].toB; }
    simplifyAdjacentChanges(changes, start, i + 1, doc, result);
  }
  return result
}

function simplifyAdjacentChanges(changes, from, to, doc, target) {
  var start = Math.max(0, changes[from].fromB - MAX_SIMPLIFY_DISTANCE);
  var end = Math.min(doc.content.size, changes[to - 1].toB + MAX_SIMPLIFY_DISTANCE);
  var text = getText(doc.content, start, end);

  for (var i = from; i < to; i++) {
    var startI = i, last = changes[i], deleted = last.lenA, inserted = last.lenB;
    while (i < to - 1) {
      var next = changes[i + 1], boundary = false;
      var prevLetter = last.toB == end ? false : isLetter(text.charCodeAt(last.toB - 1 - start));
      for (var pos = last.toB; !boundary && pos < next.fromB; pos++) {
        var nextLetter = pos == end ? false : isLetter(text.charCodeAt(pos - start));
        if ((!prevLetter || !nextLetter) && pos != changes[startI].fromB) { boundary = true; }
        prevLetter = nextLetter;
      }
      if (boundary) { break }
      deleted += next.lenA; inserted += next.lenB;
      last = next;
      i++;
    }

    if (inserted > 0 && deleted > 0 && !(inserted == 1 && deleted == 1)) {
      var from$1 = changes[startI].fromB, to$1 = changes[i].toB;
      if (from$1 < end && isLetter(text.charCodeAt(from$1 - start)))
        { while (from$1 > start && isLetter(text.charCodeAt(from$1 - 1 - start))) { from$1--; } }
      if (to$1 > start && isLetter(text.charCodeAt(to$1 - 1 - start)))
        { while (to$1 < end && isLetter(text.charCodeAt(to$1 - start))) { to$1++; } }
      var joined = fillChange(changes.slice(startI, i + 1), from$1, to$1);
      var last$1 = target.length ? target[target.length - 1] : null;
      if (last$1 && last$1.toA == joined.fromA)
        { target[target.length - 1] = new Change(last$1.fromA, joined.toA, last$1.fromB, joined.toB,
                                               last$1.deleted.concat(joined.deleted), last$1.inserted.concat(joined.inserted)); }
      else
        { target.push(joined); }
    } else {
      for (var j = startI; j <= i; j++) { target.push(changes[j]); }
    }
  }
  return changes
}

function combine(a, b) { return a === b ? a : null }

function fillChange(changes, fromB, toB) {
  var fromA = changes[0].fromA - (changes[0].fromB - fromB);
  var last = changes[changes.length - 1];
  var toA = last.toA + (toB - last.toB);
  var deleted = Span.none, inserted = Span.none;
  var delData = (changes[0].deleted.length ? changes[0].deleted : changes[0].inserted)[0].data;
  var insData = (changes[0].inserted.length ? changes[0].inserted : changes[0].deleted)[0].data;
  for (var posA = fromA, posB = fromB, i = 0;; i++) {
    var next = i == changes.length ? null : changes[i];
    var endA = next ? next.fromA : toA, endB = next ? next.fromB : toB;
    if (endA > posA) { deleted = Span.join(deleted, [new Span(endA - posA, delData)], combine); }
    if (endB > posB) { inserted = Span.join(inserted, [new Span(endB - posB, insData)], combine); }
    if (!next) { break }
    deleted = Span.join(deleted, next.deleted, combine);
    inserted = Span.join(inserted, next.inserted, combine);
    if (deleted.length) { delData = deleted[deleted.length - 1].data; }
    if (inserted.length) { insData = inserted[inserted.length - 1].data; }
    posA = next.toA; posB = next.toB;
  }
  return new Change(fromA, toA, fromB, toB, deleted, inserted)
}

// ::- A change set tracks the changes to a document from a given
// point in the past. It condenses a number of step maps down to a
// flat sequence of replacements, and simplifies replacments that
// partially undo themselves by comparing their content.
var ChangeSet = function ChangeSet(config, changes) {
  this.config = config;
  // :: [Change] Replaced regions.
  this.changes = changes;
};

var prototypeAccessors = { startDoc: { configurable: true } };

// :: (Node, [StepMap], union<[any], any>) → ChangeSet
// Computes a new changeset by adding the given step maps and
// metadata (either as an array, per-map, or as a single value to be
// associated with all maps) to the current set. Will not mutate the
// old set.
//
// Note that due to simplification that happens after each add,
// incrementally adding steps might create a different final set
// than adding all those changes at once, since different document
// tokens might be matched during simplification depending on the
// boundaries of the current changed ranges.
ChangeSet.prototype.addSteps = function addSteps (newDoc, maps, data, steps) {
    var this$1$1 = this;

  // This works by inspecting the position maps for the changes,
  // which indicate what parts of the document were replaced by new
  // content, and the size of that new content. It uses these to
  // build up Change objects.
  //
  // These change objects are put in sets and merged together using
  // Change.merge, giving us the changes created by the new steps.
  // Those changes can then be merged with the existing set of
  // changes.
  //
  // For each change that was touched by the new steps, we recompute
  // a diff to try to minimize the change by dropping matching
  // pieces of the old and new document from the change.

  var stepChanges = [];
  // Add spans for new steps.
  var loop = function ( i ) {
    var d = Array.isArray(data) ? data[i] : data;
    var off = 0;
    if (!maps[i].ranges.length) {
      var markStep = steps[i];
      stepChanges.push(
        new Change(
          markStep.from + off,
          markStep.to + off,
          markStep.from,
          markStep.to,
          [new Span(markStep.to - markStep.from, d)],
          [new Span(markStep.to - markStep.from, d)]
        )
      );
    } else {
      maps[i].forEach(function (fromA, toA, fromB, toB) {
        stepChanges.push(
          new Change(
            fromA + off,
            toA + off,
            fromB,
            toB,
            fromA == toA ? Span.none : [new Span(toA - fromA, d)],
            fromB == toB ? Span.none : [new Span(toB - fromB, d)]
          )
        );

        off = toB - fromB - (toA - fromA);
      });
    }
  };

    for (var i = 0; i < maps.length; i++) loop( i );
  if (stepChanges.length == 0) { return this }

  var newChanges = mergeAll(stepChanges, this.config.combine);
  var changes = Change.merge(this.changes, newChanges, this.config.combine);

  // Minimize changes when possible
  var loop$1 = function ( i$2 ) {
    var change = changes[i$2];
    if (
      change.fromA == change.toA ||
      change.fromB == change.toB ||
      // Only look at changes that touch newly added changed ranges
      !newChanges.some(function (r) { return r.toB > change.fromB && r.fromB < change.toB; })
    )
      { return }
    var diff = computeDiff(this$1$1.config.doc.content, newDoc.content, change, this$1$1.config.splitEnabled);

    // Fast path: If they are completely different, don't do anything
    if (diff.length == 1 && diff[0].fromB == 0 && diff[0].toB == change.toB - change.fromB) { return }

    if (diff.length == 1) {
      changes[i$2] = diff[0];
    } else {
      changes.splice.apply(changes, [ i$2, 1 ].concat( diff ));
      i$2 += diff.length - 1;
    }

      i$1 = i$2;
  };

    for (var i$1 = 0; i$1 < changes.length; i$1++) loop$1( i$1 );

  return new ChangeSet(this.config, changes)
};

// :: Node
// The starting document of the change set.
prototypeAccessors.startDoc.get = function () {
  return this.config.doc
};

// :: (f: (range: Change) → any) → ChangeSet
// Map the span's data values in the given set through a function
// and construct a new set with the resulting data.
ChangeSet.prototype.map = function map (f) {
  return new ChangeSet(
    this.config,
    this.changes.map(function (change) {
      var data = f(change);
      return data === change.data ? change : new Change(change.fromA, change.toA, change.fromB, change.toB, data)
    })
  )
};

// :: (ChangeSet, ?[StepMap]) → ?{from: number, to: number}
// Compare two changesets and return the range in which they are
// changed, if any. If the document changed between the maps, pass
// the maps for the steps that changed it as second argument, and
// make sure the method is called on the old set and passed the new
// set. The returned positions will be in new document coordinates.
ChangeSet.prototype.changedRange = function changedRange (b, maps) {
  if (b == this) { return null }
  var touched = maps && touchedRange(maps);
  var moved = touched ? touched.toB - touched.fromB - (touched.toA - touched.fromA) : 0;
  function map(p) {
    return !touched || p <= touched.fromA ? p : p + moved
  }

  var from = touched ? touched.fromB : 2e8,
    to = touched ? touched.toB : -2e8;
  function add(start, end) {
      if ( end === void 0 ) end = start;

    from = Math.min(start, from);
    to = Math.max(end, to);
  }

  var rA = this.changes,
    rB = b.changes;
  for (var iA = 0, iB = 0; iA < rA.length && iB < rB.length; ) {
    var rangeA = rA[iA],
      rangeB = rB[iB];
    if (rangeA && rangeB && sameRanges(rangeA, rangeB, map)) {
      iA++;
      iB++;
    } else if (rangeB && (!rangeA || map(rangeA.fromB) >= rangeB.fromB)) {
      add(rangeB.fromB, rangeB.toB);
      iB++;
    } else {
      add(map(rangeA.fromB), map(rangeA.toB));
      iA++;
    }
  }

  return from <= to ? { from: from, to: to } : null
};

ChangeSet.prototype.toJSON = function toJSON () {
  return {
    changes: this.changes.map(function (c) { return c.toJSON(); }),
  }
};

ChangeSet.fromJSON = function fromJSON (doc, value, combine) {
    if ( combine === void 0 ) combine = function (a, b) { return (a === b ? a : null); };

  return new ChangeSet(
    { combine: combine, doc: doc },
    value.changes.map(function (c) { return Change.fromJSON(c); })
  )
};

// :: (Node, ?(a: any, b: any) → any) → ChangeSet
// Create a changeset with the given base object and configuration.
// The `combine` function is used to compare and combine metadata—it
// should return null when metadata isn't compatible, and a combined
// version for a merged range when it is.
ChangeSet.create = function create (doc, splitEnabled, combine) {
    if ( splitEnabled === void 0 ) splitEnabled = true;
    if ( combine === void 0 ) combine = function (a, b) { return (a === b ? a : null); };

  return new ChangeSet({ combine: combine, doc: doc, splitEnabled: splitEnabled }, [])
};

Object.defineProperties( ChangeSet.prototype, prototypeAccessors );

// Exported for testing
ChangeSet.computeDiff = computeDiff;

// : ([[Change]], (any, any) → any, number, number) → [Change]
// Divide-and-conquer approach to merging a series of ranges.
function mergeAll(ranges, combine, start, end) {
  if ( start === void 0 ) start = 0;
  if ( end === void 0 ) end = ranges.length;

  if (end == start + 1) { return [ranges[start]] }
  var mid = (start + end) >> 1;
  return Change.merge(mergeAll(ranges, combine, start, mid), mergeAll(ranges, combine, mid, end), combine)
}

function endRange(maps) {
  var from = 2e8,
    to = -2e8;
  for (var i = 0; i < maps.length; i++) {
    var map = maps[i];
    if (from != 2e8) {
      from = map.map(from, -1);
      to = map.map(to, 1);
    }
    map.forEach(function (_s, _e, start, end) {
      from = Math.min(from, start);
      to = Math.max(to, end);
    });
  }
  return from == 2e8 ? null : { from: from, to: to }
}

function touchedRange(maps) {
  var b = endRange(maps);
  if (!b) { return null }
  var a = endRange(maps.map(function (m) { return m.invert(); }).reverse());
  return { fromA: a.from, toA: a.to, fromB: b.from, toB: b.to }
}

function sameRanges(a, b, map) {
  return (
    map(a.fromB) == b.fromB &&
    map(a.toB) == b.toB &&
    sameSpans(a.deleted, b.deleted) &&
    sameSpans(a.inserted, b.inserted)
  )
}

function sameSpans(a, b) {
  if (a.length != b.length) { return false }
  for (var i = 0; i < a.length; i++) { if (a[i].length != b[i].length || a[i].data !== b[i].data) { return false } }
  return true
}

exports.Change = Change;
exports.ChangeSet = ChangeSet;
exports.Span = Span;
exports.simplifyChanges = simplifyChanges;
//# sourceMappingURL=index.js.map
