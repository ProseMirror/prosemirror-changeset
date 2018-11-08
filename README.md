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

### class Span

A document range with metadata associated with it. Used to
track both inserted and deleted ranges, though deletions are
represented with a subclass.

 * **`from`**`: number`\
   The start of this span.

 * **`to`**`: number`\
   The end of the span.

 * **`data`**`: any`\
   Data associated with this span.


### class DeletedSpan extends Span

Used to represent a deletion.

 * **`pos`**`: number`\
   The position of the deletion in the current document.

 * **`slice`**`: Slice`\
   The deleted content.


### class ChangeSet

An changeset tracks the changes to a document from a given
point in the past. It condenses a number of step maps down to a
flat sequence of insertions and deletions, and merges adjacent
insertions/deletions that (partially) undo each other.

 * **`inserted`**`: [Span]`\
   Inserted regions. Their `from`/`to` point into the current
   document.

 * **`deleted`**`: [DeletedSpan]`\
   Deleted ranges. Their `from`/`to` point into the old document,
   and their `pos` into the new.

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

 * **`map`**`(mapDel: fn(from: number, to: number, pos: number, data: any) → any, mapIns: fn(from: number, to: number, data: any) → any) → ChangeSet`\
   Map the span's data values in the given set through a function
   and construct a new set with the resulting data.

 * **`changedRange`**`(b: ChangeSet, maps: ?[StepMap]) → ?{from: number, to: number}`\
   Compare two changesets and return the range in which they are
   changed, if any. If the document changed between the maps, pass
   the maps for the steps that changed it as second argument, and
   make sure the method is called on the old set and passed the new
   set. The returned positions will be in new document coordinates.

 * `static `**`create`**`(doc: Node, options: ?{compare: ?fn(a: any, b: any) → boolean, combine: ?fn(a: any, b: any) → any} = {}) → ChangeSet`\
   Create a changeset with the given base object and
   configuration. The `compare` and `combine` options should be
   functions, and are used to compare and combine metadata—`compare`
   determines whether two spans are compatible, and when they are,
   `combine` will compute the metadata value for the merged span.


