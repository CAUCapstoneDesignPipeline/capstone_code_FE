import { TopicSelect } from '../../components/TopicSelect'
import { useToast } from '../../components/toastContext'
import { useMoveNote, useNote, useTopics } from '../../data/queries'
import { moveNoteErrorMessage } from '../../lib/errorMessages'
import { withRo } from '../../lib/korean'

/**
 * 빵부스러기 "주제 › 제목"의 주제 부분 (Figma DropdownTrigger + Dropdown).
 * 누르면 주제 선택 상자가 열리고, 고르면 바로 옮긴다. 현재 주제는 캐시에서 읽어 사이드바 끌어 놓기와도 맞춘다.
 */
export function TopicDropdown({ noteId }: { noteId: string }) {
  const note = useNote(noteId)
  const topics = useTopics()
  const move = useMoveNote()
  const toast = useToast()
  const current = note.data?.topicId ?? null

  return (
    <TopicSelect
      topics={topics.data?.topics}
      value={current}
      header="주제로 옮기기"
      triggerLabel={(name) => `주제: ${name}. 다른 주제로 옮기기`}
      disabled={move.isPending}
      onChange={(topicId, name) => {
        if (topicId === current) return
        move.mutate(
          { noteId, topicId },
          {
            onSuccess: () => toast('info', `노트를 ${withRo(name)} 옮겼습니다.`),
            onError: (e) => toast('error', moveNoteErrorMessage(e)),
          },
        )
      }}
    />
  )
}
