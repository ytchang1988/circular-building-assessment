import claddingJson from './cladding.json';
import type { CompositeTemplate } from '@/engine/composite';

export type CompositeCategoryKey = 'cladding';

export const COMPOSITE_CATEGORY_ORDER: CompositeCategoryKey[] = ['cladding'];

export const COMPOSITE_TEMPLATES: Record<
  CompositeCategoryKey,
  CompositeTemplate
> = {
  cladding: claddingJson as unknown as CompositeTemplate,
};
