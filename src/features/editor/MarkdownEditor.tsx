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
import { livePreview } from './livePreview'
import styles from './MarkdownEditor.module.css'
import { pasteMarkdown } from './pasteMarkdown'
import { tablePreview } from './tablePreview'

export interface MarkdownEditorHandle {
  focus: () => void
  /** 근거 문장을 강조하고 그 자리로 스크롤한다. null이면 강조를 지운다. 찾은 결과를 돌려준다. */
  showEvidence: (evidence: EvidenceSpanLike | null) => EvidenceLocation['kind'] | null
}

interface Props {
  /** 처음 보여줄 원문. 이후 바뀌어도 반영하지 않는다 (바꾸려면 key로 새로 만든다). */
  initialValue: string
  onChange: (value: string) => void
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
  useLayoutEffect(() => {
    onChangeRef.current = props.onChange
  })

  useImperativeHandle(props.ref, () => ({
    focus: () => {
      const view = viewRef.current
      if (!view) return
      view.focus()
      view.dispatch({ selection: { anchor: 0 } })
    },
    showEvidence: (evidence) => {
      const view = viewRef.current
      if (!view) return null
      if (!evidence) {
        view.dispatch({ effects: setEvidenceHighlight.of(null) })
        return null
      }
      const at = locateEvidence(view.state.doc.toString(), evidence)
      if (at.kind === 'missing') {
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
          markdown({ base: markdownLanguage, pasteURLAsLink: false }),
          EditorView.lineWrapping,
          placeholder(text),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          livePreview,
          tablePreview,
          pasteMarkdown,
          evidenceHighlight,
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
