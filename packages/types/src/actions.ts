import type { ContentType } from './clipboard';

export type ActionId =
  | 'text.summarize'
  | 'text.translate'
  | 'text.polish'
  | 'code.explain'
  | 'code.debug';

export interface ActionDef {
  id: ActionId;
  name: string;
  description: string;
  contentType: ContentType | 'any';
  category: 'analysis' | 'transform' | 'generate' | 'debug';
}
