export function buildSummarizePrompt(content: string): string {
  return `请总结以下内容的要点，用中文输出，分点列出：\n\n${content}`;
}
