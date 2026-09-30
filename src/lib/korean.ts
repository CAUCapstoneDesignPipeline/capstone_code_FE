/** 마지막 글자의 받침 번호 (0이면 받침 없음). 한글로 끝나지 않으면 null */
function lastJongseong(word: string): number | null {
  const last = word.normalize('NFC').trim().at(-1) ?? ''
  const code = last.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return null
  return code % 28
}

/**
 * 이름 뒤에 "로/으로"를 붙인다. 받침이 있으면(ㄹ 제외) "으로".
 * 한글로 끝나지 않으면(영문·숫자) 읽는 법을 알 수 없어 "로"로 둔다.
 */
export function withRo(word: string): string {
  const jong = lastJongseong(word)
  return `${word}${jong === null || jong === 0 || jong === 8 ? '로' : '으로'}`
}

/** word 뒤에 올 "와/과". 받침이 있으면 "과". 한글로 끝나지 않으면 "와" (따옴표로 감쌀 때 조사만 따로 붙이려고 조사만 돌려준다) */
export function josaWa(word: string): '와' | '과' {
  return lastJongseong(word) ? '과' : '와'
}
