import { isApiError, titleTakenTitles } from '../api'

/** 노트 이동 실패 알림 (편집기 주제 선택 상자, 사이드바 끌어 놓기 공통) */
export function moveNoteErrorMessage(e: unknown): string {
  if (isApiError(e, 'NOTE_TITLE_TAKEN')) {
    // Figma W1-13: 괄호 안은 error.details.titles
    const titles = titleTakenTitles(e)
    const suffix = titles.length ? ` (${titles.join(', ')})` : ''
    return `옮길 주제에 같은 제목의 노트가 있어 옮기지 못했습니다.${suffix}`
  }
  if (isApiError(e, 'NOT_FOUND')) return '노트나 주제가 없어져 옮기지 못했습니다.'
  return `옮기지 못했습니다. ${e instanceof Error ? e.message : ''}`.trim()
}
