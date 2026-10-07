import { useState } from 'react'
import { isApiError, titleTakenTitles, type Topic } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { FieldError } from '../../components/FieldError'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toastContext'
import { useDeleteTopic } from '../../data/queries'
import styles from './DeleteTopicDialog.module.css'

interface Props {
  topic: Topic
  onClose: () => void
}

/** 주제 삭제 확인 (Figma Dialog confirm). 미분류에 같은 제목이 있어 막히면(NOTE_TITLE_TAKEN) blocked로 바꿔 겹치는 제목을 보여준다. */
export function DeleteTopicDialog({ topic, onClose }: Props) {
  const remove = useDeleteTopic()
  const toast = useToast()
  const [blockedTitles, setBlockedTitles] = useState<string[] | null>(null)

  const error = remove.error
  const otherError = error && !isApiError(error, 'NOTE_TITLE_TAKEN') ? error.message : null

  if (blockedTitles) {
    return (
      <ConfirmDialog
        title="주제를 삭제할 수 없습니다"
        description="미분류에 같은 제목의 노트가 있어 주제를 삭제할 수 없습니다. 겹치는 노트의 제목을 바꾼 뒤 다시 시도하세요."
        onCancel={onClose}
      >
        <div className={styles.titleList}>
          <p className={styles.titleListHeading}>겹치는 제목</p>
          <ul>
            {blockedTitles.map((t) => (
              <li key={t}>
                <Icon name="note" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </ConfirmDialog>
    )
  }

  return (
    <ConfirmDialog
      title={`'${topic.name}' 주제를 삭제할까요?`}
      description={
        topic.noteCount > 0
          ? `이 주제의 노트 ${topic.noteCount}개는 지워지지 않고 미분류로 옮겨집니다.`
          : '이 주제에는 노트가 없습니다.'
      }
      confirmLabel="삭제"
      pending={remove.isPending}
      onCancel={onClose}
      onConfirm={() =>
        remove.mutate(topic.id, {
          onSuccess: () => {
            // Figma W1-23
            const moved =
              topic.noteCount > 0 ? ` 노트 ${topic.noteCount}개를 미분류로 옮겼습니다.` : ''
            toast('info', `'${topic.name}' 주제를 삭제했습니다.${moved}`)
            onClose()
          },
          onError: (e) => {
            if (isApiError(e, 'NOTE_TITLE_TAKEN')) setBlockedTitles(titleTakenTitles(e))
          },
        })
      }
    >
      {otherError && <FieldError message={`삭제하지 못했습니다. ${otherError}`} />}
    </ConfirmDialog>
  )
}
