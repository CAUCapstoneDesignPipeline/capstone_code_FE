interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  /** 'true'면 빌드에서도 디버그용 분석 요청 버튼을 보인다 (lib/debug.ts) */
  readonly VITE_DEBUG_ANALYSIS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// cytoscape-fcose에는 타입 선언이 없다. 확장(cytoscape.use)으로만 쓴다.
declare module 'cytoscape-fcose' {
  import type { Ext } from 'cytoscape'
  const fcose: Ext
  export default fcose
}
