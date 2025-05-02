import { Node, Mark } from "prosemirror-model";

/**
 * Interface for encoding document nodes and characters into tokens for diffing.
 */
export interface TokenEncoder {
  /**
   * Encodes a character from a text node into a token.
   * @param char The character code
   * @param node The text node containing the character
   * @returns A string or number representing the token
   */
  encodeCharacter(char: number, node: Node): string | number;

  /**
   * Encodes a node into a token.
   * @param node The node to encode
   * @returns A string representing the token
   */
  encodeNode(node: Node): string;
}

/**
 * Base encoder that only considers node types and character codes.
 * This encoder ignores marks and node attributes. This is the default encoder when creating a `ChangeSet` class.
 */
export class BaseEncoder implements TokenEncoder {
  encodeCharacter(char: number, _node: Node): number {
    return char;
  }

  encodeNode(node: Node): string {
    return node.type.name;
  }
}

/**
 * Encoder that considers node types, character codes, and mark names.
 * This encoder ignores node and mark attributes.
 */
export class MarkEncoder implements TokenEncoder {
  encodeCharacter(char: number, node: Node): string | number {
    const marks = node.marks;
    if (!marks.length) return char;

    return `${char}:${this.encodeMarks(marks)}`;
  }

  encodeNode(node: Node): string {
    const nodeName = node.type.name;
    const marks = node.marks;

    if (!marks.length) return nodeName;

    return `${nodeName}:${this.encodeMarks(marks)}`;
  }

  private encodeMarks(marks: readonly Mark[]): string {
    return marks
      .map((m) => m.type.name)
      .sort()
      .join(",");
  }
}

/**
 * Encoder that considers node types, character codes, mark names, and all attributes.
 * This is the most detailed encoder but also the least performant.
 */
export class AttributeEncoder implements TokenEncoder {
  encodeCharacter(char: number, node: Node): string | number {
    const marks = node.marks;
    if (!marks.length) return char;

    return `${char}:${this.encodeMarks(marks)}`;
  }

  encodeNode(node: Node): string {
    const nodeName = node.type.name;
    const marks = node.marks;

    // Add node attributes if they exist
    let nodeStr = nodeName;
    if (Object.keys(node.attrs).length) {
      nodeStr += ":" + JSON.stringify(node.attrs);
    }

    if (!marks.length) return nodeStr;

    return `${nodeStr}:${this.encodeMarks(marks)}`;
  }

  private encodeMarks(marks: readonly Mark[]): string {
    return marks
      .map((m) => {
        let result = m.type.name;
        if (Object.keys(m.attrs).length) {
          result += ":" + JSON.stringify(m.attrs);
        }
        return result;
      })
      .sort()
      .join(",");
  }
}
