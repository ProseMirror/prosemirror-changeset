# prosemirror-changeset

This is a helper module that can turn a sequence of document changes
into a set of insertions and deletions, for example to display them in
a change-tracking interface. Such a set can be built up incrementally,
in order to do such change tracking in a halfway performant way during
live editing.

This code is licensed under an [MIT
licence](https://github.com/ProseMirror/prosemirror-changeset/blob/master/LICENSE).

## Programming interface

Insertions and deletions are represented as ‘spans’—ranges in the
document. The deleted spans refer to the original document, whereas
the inserted ones point into the current document.

It is possible to associate arbitrary data values with such spans, for
example to track the user that made the change, the timestamp at which
it was made, or the step data necessary to invert it again.

### class Change

A replaced range with metadata associated with it.

 * **`fromA`**`: number`\
   The start of the range deleted/replaced in the old
   document.

 * **`toA`**`: number`\
   The end of the range in the old document.

 * **`fromB`**`: number`\
   The start of the range inserted in the new document.

 * **`toB`**`: number`\
   The end of the range in the new document.

 * **`deleted`**`: [Span]`\
   Data associated with the deleted content. The length
   of these spans adds up to `this.toA - this.fromA`.

 * **`inserted`**`: [Span]`\
   Data associated with the inserted content. Length
   adds up to `this.toB - this.toA`.


### class Span

Stores metadata for a part of a change.

 * **`length`**`: number`

 * **`data`**`: any`


### class ChangeSet

A change set tracks the changes to a document from a given
point in the past. It condenses a number of step maps down to a
flat sequence of replacements, and simplifies replacments that
partially undo themselves by comparing their content.

 * **`changes`**`: [Change]`\
   Replaced regions.

 * **`addSteps`**`(newDoc: Node, maps: [StepMap], data: [any] | any) → ChangeSet`\
   Computes a new changeset by adding the given step maps and
   metadata (either as an array, per-map, or as a single value to be
   associated with all maps) to the current set. Will not mutate the
   old set.

   Note that due to simplification that happens after each add,
   incrementally adding steps might create a different final set
   than adding all those changes at once, since different document
   tokens might be matched during simplification depending on the
   boundaries of the current changed ranges.

 * **`map`**`(f: fn(range: Change) → any) → ChangeSet`\
   Map the span's data values in the given set through a function
   and construct a new set with the resulting data.

 * **`changedRange`**`(b: ChangeSet, maps: ?[StepMap]) → ?{from: number, to: number}`\
   Compare two changesets and return the range in which they are
   changed, if any. If the document changed between the maps, pass
   the maps for the steps that changed it as second argument, and
   make sure the method is called on the old set and passed the new
   set. The returned positions will be in new document coordinates.

 * **`deletedSpans`**`(f: fn(fromA: number, toA: number, posB: number, data: any) → void)`\
   Iterate over the deleted ranges in the change set. `posB` refers
   to the position in the current document at which the deletion
   occurred, and `fromA` to `toA` is the range in the old document
   that was deleted.

 * **`insertedSpans`**`(f: fn(fromB: number, toB: number, data: any) → void)`\
   Iterate over the inserted ranges in the change set.

 * `static `**`create`**`(doc: Node, combine: ?fn(a: any, b: any) → any) → ChangeSet`\
   Create a changeset with the given base object and configuration.
   The `combine` function is used to compare and combine metadata—it
   should return null when metadata isn't compatible, and a combined
   version for a merged range when it is.


