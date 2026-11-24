// 新規セッションのモデル一覧（dots-pwa-sessions/app.js と同じ）
export type Kind = 'claude' | 'agy';

export const CLAUDE_MODELS: [string, string][] = [
  ['claude-opus-5-5', 'Opus 5.5'],
  ['claude-sonnet-5-5', 'Sonnet 5.5'],
  ['claude-haiku-5-5', 'Haiku 5.5'],
];
export const AGY_MODELS: [string, string][] = [
  ['gemini-4-neon-medium', 'Neon Medium'],
  ['gemini-4-neon-low', 'Neon Low'],
  ['gemini-4-neon-high', 'Neon High'],
  ['gemini-4-neon-xhigh', 'Neon XHigh'],
  ['gemini-pro-orchestrator-neon', 'Orchestrator (Neon)'],
  ['gemini-4-hydrogen-medium', 'Hydrogen Medium'],
  ['gemini-4-hydrogen-low', 'Hydrogen Low'],
  ['gemini-4-hydrogen-high', 'Hydrogen High'],
  ['gemini-4-hydrogen-xhigh', 'Hydrogen XHigh'],
  ['gemini-4-argon-medium', 'Argon Medium'],
  ['gemini-3.8-flash-medium', 'Gemini 3.8 Flash'],
];
export const EFFORTS: [string, string][] = [
  ['low', '低'],
  ['medium', '中'],
  ['high', '高'],
];

export function modelName(id: string) {
  const hit = [...CLAUDE_MODELS, ...AGY_MODELS].find(([v]) => v === id);
  return hit ? hit[1] : id;
}
