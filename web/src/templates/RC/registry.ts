import columnsJson from './columns.json';
import beamsJson from './beams.json';
import slabsJson from './slabs.json';
import wallsJson from './walls.json';
import type { RCColumnsTemplate } from '@/engine/columns';

/** All RC "monolithic" categories: concrete + rebar, by m³. They share the
 *  exact same math; only `rebarDefaultMassPerM3` and the default strength
 *  differ. */
export type RCCategoryKey = 'columns' | 'beams' | 'slabs' | 'walls';

export const RC_CATEGORY_ORDER: RCCategoryKey[] = [
  'columns',
  'beams',
  'slabs',
  'walls',
];

export const RC_TEMPLATES: Record<RCCategoryKey, RCColumnsTemplate> = {
  columns: columnsJson as unknown as RCColumnsTemplate,
  beams: beamsJson as unknown as RCColumnsTemplate,
  slabs: slabsJson as unknown as RCColumnsTemplate,
  walls: wallsJson as unknown as RCColumnsTemplate,
};
