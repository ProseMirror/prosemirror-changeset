import { Slice } from "prosemirror-model"
import { StepMap } from "prosemirror-transform"

export class Span {
  readonly from: number
  readonly to: number
  readonly data: any
}

export class DeletedSpan extends Span {
  readonly pos: number
  readonly slice: Slice
}

export type Metadata = any[] | {[key: string]: any}

export class ChangeSet {
  readonly inserted: Span[]
  readonly deleted: DeletedSpan[]
  addSteps (newDoc: Node, maps: ReadonlyArray<StepMap>, data: Metadata): Changeset
  static create (doc: Node, object ?: { compare: (a: Metadata, b: Metadata) => boolean, combine: (a: Metadata) => Metadata})
}