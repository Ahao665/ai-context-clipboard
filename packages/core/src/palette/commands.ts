import type { PaletteCommand } from '@ai-clipboard/types';

/** The 5 AI actions, exposed as launchable palette commands. */
export const PALETTE_COMMANDS: PaletteCommand[] = [
  { id: 'summarize', actionId: 'text.summarize', label: '总结', description: '提取内容要点', keywords: ['总结', 'summarize', '概要', 'zj'], category: 'AI' },
  { id: 'translate', actionId: 'text.translate', label: '翻译', description: '翻译为中文', keywords: ['翻译', 'translate', 'fanyi'], category: 'AI' },
  { id: 'rewrite', actionId: 'text.polish', label: '润色', description: '改进表达和语法', keywords: ['润色', 'rewrite', 'polish', '改写'], category: 'AI' },
  { id: 'reply', actionId: 'text.reply', label: '回复', description: '生成自然回复', keywords: ['回复', 'reply', 'huifu'], category: 'AI' },
  { id: 'explain', actionId: 'text.explain', label: '解释', description: '用简单语言解释', keywords: ['解释', 'explain', 'jieshi'], category: 'AI' },
];
