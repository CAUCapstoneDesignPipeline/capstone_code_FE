import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
import { livePreview } from './livePreview'
import styles from './MarkdownEditor.module.css'

export interface MarkdownEditorHandle {
  focus: () => void
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
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          placeholder(text),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          livePreview,
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
