import { useState } from 'react'
import { isApiError, titleTakenTitles, type Topic } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useDeleteTopic } from '../../data/queries'

interface Props {
  topic: Topic
  onClose: () => void
}

/** 주제 삭제 확인. 미분류에 같은 제목이 있어 막히면(NOTE_TITLE_TAKEN) 겹치는 제목을 보여준다. */
export function DeleteTopicDialog({ topic, onClose }: Props) {
  const remove = useDeleteTopic()
  const [blockedTitles, setBlockedTitles] = useState<string[] | null>(null)

  const error = remove.error
  const otherError = error && !isApiError(error, 'NOTE_TITLE_TAKEN') ? error.message : null

  if (blockedTitles) {
    return (
      <ConfirmDialog
        title={`"${topic.name}" 주제를 삭제할 수 없습니다`}
        confirmLabel=""
        hideConfirm
        cancelLabel="닫기"
        onConfirm={onClose}
        onCancel={onClose}
      >
        <p>미분류에 같은 제목의 노트가 있어 이 주제의 노트를 미분류로 옮길 수 없습니다.</p>
        <ul>
          {blockedTitles.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p>한쪽 노트의 제목을 바꾼 뒤 다시 시도하세요.</p>
      </ConfirmDialog>
    )
  }

  return (
    <ConfirmDialog
      title={`"${topic.name}" 주제를 삭제할까요?`}
      confirmLabel="삭제"
      danger
      pending={remove.isPending}
      onCancel={onClose}
      onConfirm={() =>
        remove.mutate(topic.id, {
          onSuccess: onClose,
          onError: (e) => {
            if (isApiError(e, 'NOTE_TITLE_TAKEN')) setBlockedTitles(titleTakenTitles(e))
          },
        })
      }
    >
      <p>
        {topic.noteCount > 0
          ? `이 주제의 노트 ${topic.noteCount}개는 지워지지 않고 미분류로 옮겨집니다.`
          : '이 주제에는 노트가 없습니다.'}
      </p>
      {otherError && <p role="alert">삭제하지 못했습니다. {otherError}</p>}
    </ConfirmDialog>
  )
}
