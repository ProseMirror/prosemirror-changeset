const ist = require('ist')
const { doc, p, em, strong, h1, h2, ordered_list, list_item } = require('prosemirror-test-builder')

const {
  Span,
  Change,
  ChangeSet: { computeDiff },
} = require('..')

describe('computeDiff', () => {
  function test(doc1, doc2, ...ranges) {
    let diff = computeDiff(
      doc1.content,
      doc2.content,
      new Change(
        0,
        doc1.content.size,
        0,
        doc2.content.size,
        [new Span(doc1.content.size, 0)],
        [new Span(doc2.content.size, 0)],
      )
    )
    ist(JSON.stringify(diff.map((r) => [r.fromA, r.toA, r.fromB, r.toB])), JSON.stringify(ranges))
  }

  it('returns an empty diff for identical documents', () => test(doc(p('foo'), p('bar')), doc(p('foo'), p('bar'))))

  it('finds single-letter changes', () => test(doc(p('foo'), p('bar')), doc(p('foa'), p('bar')), [3, 4, 3, 4]))

  it('finds simple structure changes', () => test(doc(p('foo'), p('bar')), doc(p('foobar')), [4, 6, 4, 4]))

  it('finds multiple changes', () =>
    test(doc(p('foo'), p('---bar')), doc(p('fgo'), p('---bur')), [2, 4, 2, 4], [10, 11, 10, 11]))

  it('ignores single-letter unchanged parts', () => test(doc(p('abcdef')), doc(p('axydzf')), [2, 6, 2, 6]))

  it('ignores matching substrings in longer diffs', () =>
    test(
      doc(p('One two three')),
      doc(p('One'), p('And another long paragraph that has wo and ee in it')),
      [4,14,4,5],[14,14,5,57]
    )
  )

  it('finds deletions', () => test(doc(p('abc'), p('def')), doc(p('ac'), p('d')), [2, 3, 2, 2], [7, 9, 6, 6]))

  it("doesn't ignore marks", () => test(doc(p('abc')), doc(p('a', strong('bc'))), [2, 4, 2, 4]))

  it("doesn't ignore marks in diffing", () =>
    test(doc(p('abcdefghi')), doc(p(em('x'), strong('bc'), 'defgh', em('y'))), [1, 4, 1, 4], [9, 10, 9, 10]))

  it("doesn't ignore all attributes", () => test(doc(h1('x')), doc(h2('x')), [0, 1, 0, 1]))

  it('ignores predefined attributes', () => test(doc(h1('x', { blockId: '1' })), doc(h1('x', { blockId: '2' }))))

  it('finds huge deletions', () => {
    let xs = 'x'.repeat(200),
      bs = 'b'.repeat(20)
    test(doc(p('a' + bs + 'c')), doc(p('a' + xs + bs + xs + 'c')), [2, 2, 2, 202], [22, 22, 222, 422])
  })

  it('finds huge insertions', () => {
    let xs = 'x'.repeat(200),
      bs = 'b'.repeat(20)
    test(doc(p('a' + xs + bs + xs + 'c')), doc(p('a' + bs + 'c')), [2, 202, 2, 2], [222, 422, 22, 22])
  })

  it('can handle ambiguous diffs', () => test(doc(p('abcbcd')), doc(p('abcd')), [4, 6, 4, 4]))

  it('can handle prepended heading with overlapping content', () =>
    test(
      doc(h1('abcd')),
      doc(h1('abef'), h1('abcd')),
      [0,0,0,6]
    ))

  it('can handle headings with overlapping content', () =>
    test(
      doc(h1('abcd'), h2('abcd')),
      doc(h1('abef'), h1('abcd'), h2('abef'), h2('abcd')),
      [0,0,0,6],
      [6, 6, 12, 18]
    ))

  it('isn\'t too greedy merging changes across blocks' , () =>
    test(
      doc(
        p('Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry\'s standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.'),
        p('abcde'),
        p('efhi'),
      ),
      doc(
        p('TLorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry\'s standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.'),
        p('sadcd'),
        p('efhij')
      ),
      [1,1,1,2],[577,582,578,583],[588,588,589,590]
    )
  )

  it('splits insertions' , () =>
    test(
      doc(
        p('Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry\'s standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.'),
        p('this is a single paragraph')
      ),
      doc(
        p('TLorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry\'s standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.'),
        p('this is a single paragraph with some text'),
        p('and another paragraph'),
        p('and another paragraph'),
        p('and one more'),
      ),
      [1,1,1,2],[603,603,604,620],[603,603,620,643],[603,603,643,666],[603,603,666,679]
    ))

  it('splits root level insertions' , () =>
    test(
      doc(
        p('hello'),
        p('world')
      ),
      doc(
        p('hello'),
        p('world'),
        p('and another paragraph'),
        p('and another paragraph'),
        p('and one more'),
      ),
      [14,14,14,37],[14,14,37,60],[14,14,60,74]
    ))
})
