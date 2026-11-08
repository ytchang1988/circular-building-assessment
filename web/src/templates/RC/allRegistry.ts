/** Unified registry of all 8 categories across 3 UI groups. */
import columnsJson from './columns.json';
import beamsJson from './beams.json';
import slabsJson from './slabs.json';
import wallsJson from './walls.json';
import claddingJson from './cladding.json';
import windowsJson from './windows.json';
import interiorWallsJson from './interior_walls.json';
import floorsJson from './floors.json';

import type { RCColumnsTemplate } from '@/engine/columns';
import type { CompositeTemplate } from '@/engine/composite';
import type { WindowsTemplate } from '@/engine/windows';
import type { InteriorWallsTemplate } from '@/engine/interiorWalls';
import type { FloorsTemplate } from '@/engine/floors';

export type GroupKey = 'structure' | 'envelope' | 'interior';

export type RCMonoCategory = 'columns' | 'beams' | 'slabs' | 'walls';
export type CompositeCategory = 'cladding';
export type WindowsCategory = 'windows';
export type LifecycleCategory = 'interiorWalls' | 'floors';

export type AnyCategory =
  | RCMonoCategory
  | CompositeCategory
  | WindowsCategory
  | LifecycleCategory;

export type EngineType = 'rcMono' | 'composite' | 'windows' | 'interiorWalls' | 'floors';

export const CATEGORY_ENGINE: Record<AnyCategory, EngineType> = {
  columns: 'rcMono',
  beams: 'rcMono',
  slabs: 'rcMono',
  walls: 'rcMono',
  cladding: 'composite',
  windows: 'windows',
  interiorWalls: 'interiorWalls',
  floors: 'floors',
};

export const GROUPS: Record<GroupKey, AnyCategory[]> = {
  structure: ['columns', 'beams', 'slabs'],
  envelope: ['walls', 'cladding', 'windows'],
  interior: ['interiorWalls', 'floors'],
};

export const RC_MONO_TEMPLATES: Record<RCMonoCategory, RCColumnsTemplate> = {
  columns: columnsJson as unknown as RCColumnsTemplate,
  beams: beamsJson as unknown as RCColumnsTemplate,
  slabs: slabsJson as unknown as RCColumnsTemplate,
  walls: wallsJson as unknown as RCColumnsTemplate,
};

export const CLADDING_TEMPLATE = claddingJson as unknown as CompositeTemplate;
export const WINDOWS_TEMPLATE = windowsJson as unknown as WindowsTemplate;
export const INTERIOR_WALLS_TEMPLATE =
  interiorWallsJson as unknown as InteriorWallsTemplate;
export const FLOORS_TEMPLATE = floorsJson as unknown as FloorsTemplate;

/** Category label key for i18n: `categoryLabels.<cat>`. */
export const CATEGORY_LABEL_KEY: Record<AnyCategory, string> = {
  columns: 'categoryLabels.columns',
  beams: 'categoryLabels.beams',
  slabs: 'categoryLabels.slabs',
  walls: 'categoryLabels.walls',
  cladding: 'categoryLabels.cladding',
  windows: 'categoryLabels.windows',
  interiorWalls: 'categoryLabels.interiorWalls',
  floors: 'categoryLabels.floors',
};

/** Human-readable canonical name for engine aggregation. */
export const CATEGORY_DISPLAY_NAME: Record<AnyCategory, string> = {
  columns: 'RC結構柱',
  beams: 'RC結構梁',
  slabs: 'RC結構樓板',
  walls: 'RC外牆',
  windows: 'RC外窗',
  cladding: 'RC外裝',
  interiorWalls: 'RC內牆',
  floors: 'RC地坪',
};

export const GROUP_LABEL_KEY: Record<GroupKey, string> = {
  structure: 'groups.structure',
  envelope: 'groups.envelope',
  interior: 'groups.interior',
};
