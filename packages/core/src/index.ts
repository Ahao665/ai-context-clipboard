export { EventBus, globalEventBus } from './event-bus';
export { AIClient } from './ai/client';
export { executeSummarize, buildSummarizePrompt } from './actions/summarize';
export { executeTranslate, buildTranslatePrompt } from './actions/translate';
export { executeRewrite, buildRewritePrompt } from './actions/rewrite';
export { executeReply, buildReplyPrompt } from './actions/reply';
export { executeExplain, buildExplainPrompt } from './actions/explain';
export { fuzzyMatch } from './palette/fuzzy';
export { PALETTE_COMMANDS } from './palette/commands';
export { composePaletteResults } from './palette/search';
export {
  matchCommands,
  orderEntries,
  rankEntriesByQuery,
  filterByType,
  buildPaletteResult,
} from './palette/search';
export {
  detectContent,
  looksLikeCode,
  looksSensitive,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_ICONS,
} from './detect/content-type';
export type { Detection } from './detect/content-type';
