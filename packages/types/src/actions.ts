import type { ContentType } from './clipboard';

export type ActionId =
  | 'text.summarize'
  | 'text.translate'
  | 'text.polish'
  | 'text.reply'
  | 'text.explain'
  | 'code.explain'
  | 'code.debug';

export interface ActionDef {
  id: ActionId;
  name: string;
  description: string;
  contentType: ContentType | 'any';
  category: 'analysis' | 'transform' | 'generate' | 'debug';
}

export interface ActionResult {
  actionId: ActionId;
  content: string;
  success: boolean;
  error?: string;
}

export interface ActionContext {
  content: string;
  contentType: ContentType;
}
