import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
import {
  evidenceHighlight,
  locateEvidence,
  setEvidenceHighlight,
  type EvidenceLocation,
  type EvidenceSpanLike,
} from './evidenceHighlight'
import { insertionAt } from '../../lib/insertedKnowledge'
import { livePreview } from './livePreview'
import styles from './MarkdownEditor.module.css'
import { mathPreview, mathSyntax } from './mathPreview'
import { pasteMarkdown } from './pasteMarkdown'
import {
  blockBefore,
  blockBoundaries,
  insertedRecommendation,
  isInsertedRecommendation,
  recommendDrop,
  setInsertIndicator,
} from './recommendDrop'
import { tablePreview } from './tablePreview'

export interface MarkdownEditorHandle {
  focus: () => void
  /**
   * 근거 문장을 강조하고 그 자리로 스크롤한다. null이면 강조를 지운다. 찾은 결과를 돌려준다.
   * docVersion(지금 노트의 저장된 version)이 근거의 noteVersion과 다르면 강조하지 않는다 (outdated).
   */
  showEvidence: (
    evidence: EvidenceSpanLike | null,
    docVersion?: number,
  ) => EvidenceLocation['kind'] | null
  /** 블록 사이 자리 (추천 카드를 넣을 수 있는 곳, Issue #43) */
  boundaries: () => number[]
  /** 자리 앞 블록의 첫 줄. 맨 앞이면 null */
  describeBoundary: (pos: number) => string | null
  /** "여기에 넣기" 선을 보이거나 지운다(null). scroll이면 그 자리를 화면 가운데로 */
  showInsertIndicator: (pos: number | null, scroll?: boolean) => void
  /** 블록 사이 자리에 마크다운 블록을 넣는다. onChange는 inserted로 불린다 */
  insertBlock: (pos: number, markdown: string) => void
}

interface Props {
  /** 처음 보여줄 원문. 이후 바뀌어도 반영하지 않는다 (바꾸려면 key로 새로 만든다). */
  initialValue: string
  /** inserted: 추천 카드를 넣은 변경이다 (사용자의 입력이 아니다) */
  onChange: (value: string, inserted: boolean) => void
  /** 추천 카드를 본문에 놓았을 때 (추천 id, 블록 사이 자리) */
  onRecommendationDrop?: (recommendationId: string, pos: number) => void
  /** 끌고 있는 추천 카드를 이 편집기에 놓을 수 있는지. 없으면 놓을 수 없다 */
  acceptsRecommendationDrop?: () => boolean
  placeholder: string
  ariaLabel: string
  autoFocus?: boolean
  ref?: Ref<MarkdownEditorHandle>
}

/** 마크다운 원문 편집기 (CodeMirror 6 + Live Preview, Figma W1-06) */
export function MarkdownEditor(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(props.onChange)
  const onDropRef = useRef(props.onRecommendationDrop)
  const acceptsDropRef = useRef(props.acceptsRecommendationDrop)
  useLayoutEffect(() => {
    onChangeRef.current = props.onChange
    onDropRef.current = props.onRecommendationDrop
    acceptsDropRef.current = props.acceptsRecommendationDrop
  })

  useImperativeHandle(props.ref, () => ({
    focus: () => {
      const view = viewRef.current
      if (!view) return
      view.focus()
      view.dispatch({ selection: { anchor: 0 } })
    },
    showEvidence: (evidence, docVersion) => {
      const view = viewRef.current
      if (!view) return null
      if (!evidence) {
        view.dispatch({ effects: setEvidenceHighlight.of(null) })
        return null
      }
      const at = locateEvidence(view.state.doc.toString(), evidence, docVersion)
      // 찾은 위치가 없으면(missing·outdated) 강조를 지운다
      if (!('from' in at)) {
        view.dispatch({ effects: setEvidenceHighlight.of(null) })
      } else {
        view.dispatch({
          effects: [
            setEvidenceHighlight.of({ from: at.from, to: at.to }),
            EditorView.scrollIntoView(at.from, { y: 'center' }),
          ],
        })
      }
      return at.kind
    },
    boundaries: () => (viewRef.current ? blockBoundaries(viewRef.current.state) : []),
    describeBoundary: (pos) => (viewRef.current ? blockBefore(viewRef.current.state, pos) : null),
    showInsertIndicator: (pos, scroll) => {
      const view = viewRef.current
      if (!view) return
      view.dispatch({
        effects: [
          setInsertIndicator.of(pos),
          ...(pos !== null && scroll ? [EditorView.scrollIntoView(pos, { y: 'center' })] : []),
        ],
      })
    },
    insertBlock: (pos, markdown) => {
      const view = viewRef.current
      if (!view) return
      const change = insertionAt(view.state.doc.toString(), pos, markdown)
      view.dispatch({
        changes: change,
        // 넣은 블록이 보이게 스크롤한다. 커서는 옮기지 않는다
        effects: [
          setInsertIndicator.of(null),
          EditorView.scrollIntoView(change.from, { y: 'nearest' }),
        ],
        annotations: insertedRecommendation.of(true),
      })
    },
  }))

  // 처음 한 번만 만든다. 원문을 바꿔야 하면(다른 곳의 내용 불러오기) 부모가 key를 바꿔 새로 만든다.
  const { initialValue, placeholder: text, ariaLabel, autoFocus } = props
  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
          // 주소 붙여넣기는 pasteMarkdown이 맡는다 (여러 줄을 고르면 링크로 만들지 않는 등)
          markdown({ base: markdownLanguage, extensions: [mathSyntax], pasteURLAsLink: false }),
          EditorView.lineWrapping,
          placeholder(text),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return
            onChangeRef.current(u.state.doc.toString(), isInsertedRecommendation(u.transactions))
          }),
          livePreview,
          tablePreview,
          mathPreview,
          pasteMarkdown,
          evidenceHighlight,
          recommendDrop({
            onDrop: (id, pos) => onDropRef.current?.(id, pos),
            accepts: () => acceptsDropRef.current?.() ?? false,
          }),
        ],
      }),
    })
    viewRef.current = view
    if (autoFocus) view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 처음 값만 쓴다 (위 설명)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={hostRef} className={styles.editor} />
}
