import { create } from 'zustand';
import type { ColumnElement } from '@/engine/types';
import type { AreaElement } from '@/engine/composite';
import type { WindowElement } from '@/engine/windows';
import type { InteriorWallElement } from '@/engine/interiorWalls';
import type { FloorElement } from '@/engine/floors';
import {
  RC_CATEGORY_ORDER,
  RC_TEMPLATES,
  type RCCategoryKey,
} from '@/templates/RC/registry';
import {
  COMPOSITE_CATEGORY_ORDER,
  COMPOSITE_TEMPLATES,
  type CompositeCategoryKey,
} from '@/templates/RC/compositeRegistry';
import {
  WINDOWS_TEMPLATE,
  INTERIOR_WALLS_TEMPLATE,
  FLOORS_TEMPLATE,
} from '@/templates/RC/allRegistry';

export type BuildingType = 'RC' | 'SRC';

export interface ProjectMeta {
  name: string;
  buildingType: BuildingType;
  totalFloorArea: number;
  /** Used by interior walls (3-1) and floors (3-2) to pick lifecycle update count. */
  buildingClass: string;
}

export type ElementsByCategory = Record<RCCategoryKey, ColumnElement[]>;
export type AreaElementsByCategory = Record<CompositeCategoryKey, AreaElement[]>;
export type LifecycleCategoryKey = 'interiorWalls' | 'floors';
export type LifecycleElements = {
  interiorWalls: InteriorWallElement[];
  floors: FloorElement[];
};

export interface ProjectState {
  meta: ProjectMeta;
  elements: ElementsByCategory;
  areaElements: AreaElementsByCategory;
  windowElements: WindowElement[];
  lifecycleElements: LifecycleElements;

  setMeta: (patch: Partial<ProjectMeta>) => void;

  // RC monolithic (columns/beams/slabs/walls)
  addElement: (cat: RCCategoryKey) => void;
  updateElement: (cat: RCCategoryKey, id: string, patch: Partial<ColumnElement>) => void;
  removeElement: (cat: RCCategoryKey, id: string) => void;
  removeElements: (cat: RCCategoryKey, ids: string[]) => void;
  updateElements: (cat: RCCategoryKey, ids: string[], patch: Partial<ColumnElement>) => void;
  clearElements: (cat: RCCategoryKey) => void;
  consolidateElements: (cat: RCCategoryKey) => { before: number; after: number };
  importElements: (
    cat: RCCategoryKey,
    rows: Omit<ColumnElement, 'id'>[],
    mode: 'append' | 'replace',
  ) => void;

  // Composite (cladding)
  addAreaElement: (cat: CompositeCategoryKey) => void;
  updateAreaElement: (cat: CompositeCategoryKey, id: string, patch: Partial<AreaElement>) => void;
  updateAreaElements: (cat: CompositeCategoryKey, ids: string[], patch: Partial<AreaElement>) => void;
  removeAreaElement: (cat: CompositeCategoryKey, id: string) => void;
  removeAreaElements: (cat: CompositeCategoryKey, ids: string[]) => void;
  clearAreaElements: (cat: CompositeCategoryKey) => void;
  consolidateAreaElements: (cat: CompositeCategoryKey) => { before: number; after: number };
  importAreaElements: (
    cat: CompositeCategoryKey,
    rows: Omit<AreaElement, 'id'>[],
    mode: 'append' | 'replace',
  ) => void;

  // Windows (2-3)
  addWindowElement: () => void;
  updateWindowElement: (id: string, patch: Partial<WindowElement>) => void;
  updateWindowElements: (ids: string[], patch: Partial<WindowElement>) => void;
  removeWindowElement: (id: string) => void;
  removeWindowElements: (ids: string[]) => void;
  clearWindowElements: () => void;
  consolidateWindowElements: () => { before: number; after: number };
  importWindowElements: (
    rows: Omit<WindowElement, 'id'>[],
    mode: 'append' | 'replace',
  ) => void;

  // Lifecycle (interior walls, floors)
  addLifecycleElement: (cat: LifecycleCategoryKey) => void;
  updateLifecycleElement: (
    cat: LifecycleCategoryKey,
    id: string,
    patch: Partial<InteriorWallElement | FloorElement>,
  ) => void;
  updateLifecycleElements: (
    cat: LifecycleCategoryKey,
    ids: string[],
    patch: Partial<InteriorWallElement | FloorElement>,
  ) => void;
  removeLifecycleElement: (cat: LifecycleCategoryKey, id: string) => void;
  removeLifecycleElements: (cat: LifecycleCategoryKey, ids: string[]) => void;
  clearLifecycleElements: (cat: LifecycleCategoryKey) => void;
  consolidateLifecycleElements: (cat: LifecycleCategoryKey) => { before: number; after: number };
  importLifecycleElements: (
    cat: LifecycleCategoryKey,
    rows: Omit<InteriorWallElement | FloorElement, 'id'>[],
    mode: 'append' | 'replace',
  ) => void;
}

let _id = 0;
const newId = () => `el_${++_id}`;

const seed = (cat: RCCategoryKey): ColumnElement => {
  const d = RC_TEMPLATES[cat].elementDefaults;
  return {
    id: newId(),
    floor: '',
    family: '',
    volumeM3: 1,
    note: '',
    concreteStrength: d.concreteStrength,
    admixturePct: d.admixturePct,
    reused: d.reused,
    prefabModular: d.prefabModular,
    greenDemolition: false,
  };
};

const mergeKey = (c: ColumnElement): string =>
  JSON.stringify([
    c.floor ?? '',
    c.family ?? '',
    c.concreteStrength,
    c.admixturePct,
    c.reused,
    c.prefabModular,
    c.greenDemolition,
  ]);

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function consolidate(elements: ColumnElement[]): ColumnElement[] {
  const groups = new Map<string, ColumnElement[]>();
  for (const c of elements) {
    const k = mergeKey(c);
    const existing = groups.get(k);
    if (existing) existing.push(c);
    else groups.set(k, [c]);
  }
  const merged: ColumnElement[] = [];
  for (const items of groups.values()) {
    const first = items[0];
    const totalVolume = round3(items.reduce((s, c) => s + c.volumeM3, 0));
    if (items.length === 1) merged.push(first);
    else merged.push({
      ...first, id: newId(), volumeM3: totalVolume, note: `×${items.length}`,
    });
  }
  return merged;
}

/** Common shape for area-based mergeable elements (cladding / interior walls / floors). */
type AreaMergeable = {
  id: string;
  floor?: string;
  family?: string;
  areaM2: number;
  note?: string;
  constructionType: string;
  reused: boolean;
  greenRecycled: boolean;
  prefabModular: boolean;
  greenDemolition: boolean;
};

function consolidateAreaBased<T extends AreaMergeable>(elements: T[]): T[] {
  const key = (c: T) =>
    JSON.stringify([
      c.floor ?? '', c.family ?? '', c.constructionType,
      c.reused, c.greenRecycled, c.prefabModular, c.greenDemolition,
    ]);
  const groups = new Map<string, T[]>();
  for (const c of elements) {
    const k = key(c);
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  const merged: T[] = [];
  for (const items of groups.values()) {
    const first = items[0];
    if (items.length === 1) { merged.push(first); continue; }
    const totalArea = round3(items.reduce((s, c) => s + c.areaM2, 0));
    merged.push({ ...first, id: newId(), areaM2: totalArea, note: `×${items.length}` });
  }
  return merged;
}

function consolidateWindows(elements: WindowElement[]): WindowElement[] {
  const key = (c: WindowElement) =>
    JSON.stringify([
      c.floor ?? '', c.family ?? '', c.glass, c.frame,
      c.reused, c.prefabModular, c.greenDemolition,
    ]);
  const groups = new Map<string, WindowElement[]>();
  for (const c of elements) {
    const k = key(c);
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  const merged: WindowElement[] = [];
  for (const items of groups.values()) {
    const first = items[0];
    if (items.length === 1) { merged.push(first); continue; }
    const totalArea = round3(items.reduce((s, c) => s + c.areaM2, 0));
    merged.push({ ...first, id: newId(), areaM2: totalArea, note: `×${items.length}` });
  }
  return merged;
}

const emptyElements = (): ElementsByCategory =>
  RC_CATEGORY_ORDER.reduce((acc, k) => { acc[k] = []; return acc; }, {} as ElementsByCategory);

const seededElements = (): ElementsByCategory => {
  const o = emptyElements();
  o.columns = [seed('columns')];
  return o;
};

const seedArea = (cat: CompositeCategoryKey): AreaElement => {
  const d = COMPOSITE_TEMPLATES[cat].elementDefaults;
  return {
    id: newId(), floor: '', family: '', areaM2: 1, note: '',
    constructionType: d.constructionType,
    reused: d.reused,
    greenRecycled: d.greenRecycled,
    prefabModular: d.prefabModular,
    greenDemolition: false,
  };
};

const emptyAreaElements = (): AreaElementsByCategory =>
  COMPOSITE_CATEGORY_ORDER.reduce((acc, k) => { acc[k] = []; return acc; }, {} as AreaElementsByCategory);

const seedWindow = (): WindowElement => {
  const d = WINDOWS_TEMPLATE.elementDefaults;
  return {
    id: newId(), floor: '', family: '', areaM2: 1, note: '',
    glass: d.glass, frame: d.frame,
    reused: d.reused, prefabModular: d.prefabModular,
    greenDemolition: false,
  };
};

const seedInteriorWall = (): InteriorWallElement => {
  const d = INTERIOR_WALLS_TEMPLATE.elementDefaults;
  return {
    id: newId(), floor: '', family: '', areaM2: 1, note: '',
    constructionType: d.constructionType,
    reused: d.reused, greenRecycled: d.greenRecycled, prefabModular: d.prefabModular,
    greenDemolition: false,
  };
};

const seedFloor = (): FloorElement => {
  const d = FLOORS_TEMPLATE.elementDefaults;
  return {
    id: newId(), floor: '', family: '', areaM2: 1, note: '',
    constructionType: d.constructionType,
    reused: d.reused, greenRecycled: d.greenRecycled, prefabModular: d.prefabModular,
    greenDemolition: false,
  };
};

export const useProject = create<ProjectState>((set, get) => ({
  meta: {
    name: '',
    buildingType: 'RC',
    totalFloorArea: 0,
    buildingClass: INTERIOR_WALLS_TEMPLATE.defaultBuildingClass,
  },
  elements: seededElements(),
  areaElements: emptyAreaElements(),
  windowElements: [],
  lifecycleElements: { interiorWalls: [], floors: [] },

  setMeta: (patch) => set((s) => ({ meta: { ...s.meta, ...patch } })),

  // RC mono
  addElement: (cat) =>
    set((s) => ({ elements: { ...s.elements, [cat]: [...s.elements[cat], seed(cat)] } })),
  updateElement: (cat, id, patch) =>
    set((s) => ({
      elements: {
        ...s.elements,
        [cat]: s.elements[cat].map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    })),
  removeElement: (cat, id) =>
    set((s) => ({
      elements: { ...s.elements, [cat]: s.elements[cat].filter((c) => c.id !== id) },
    })),
  removeElements: (cat, ids) =>
    set((s) => {
      const toRemove = new Set(ids);
      return {
        elements: { ...s.elements, [cat]: s.elements[cat].filter((c) => !toRemove.has(c.id)) },
      };
    }),
  updateElements: (cat, ids, patch) =>
    set((s) => {
      const toUpdate = new Set(ids);
      return {
        elements: {
          ...s.elements,
          [cat]: s.elements[cat].map((c) => (toUpdate.has(c.id) ? { ...c, ...patch } : c)),
        },
      };
    }),
  clearElements: (cat) =>
    set((s) => ({ elements: { ...s.elements, [cat]: [] } })),
  consolidateElements: (cat) => {
    const before = get().elements[cat].length;
    const merged = consolidate(get().elements[cat]);
    set((s) => ({ elements: { ...s.elements, [cat]: merged } }));
    return { before, after: merged.length };
  },
  importElements: (cat, rows, mode) =>
    set((s) => {
      const newEls: ColumnElement[] = rows.map((r) => ({ ...r, id: newId() }));
      return {
        elements: {
          ...s.elements,
          [cat]: mode === 'replace' ? newEls : [...s.elements[cat], ...newEls],
        },
      };
    }),

  // Composite (cladding)
  addAreaElement: (cat) =>
    set((s) => ({
      areaElements: { ...s.areaElements, [cat]: [...s.areaElements[cat], seedArea(cat)] },
    })),
  updateAreaElement: (cat, id, patch) =>
    set((s) => ({
      areaElements: {
        ...s.areaElements,
        [cat]: s.areaElements[cat].map((e) => (e.id === id ? { ...e, ...patch } : e)),
      },
    })),
  updateAreaElements: (cat, ids, patch) =>
    set((s) => {
      const toUpdate = new Set(ids);
      return {
        areaElements: {
          ...s.areaElements,
          [cat]: s.areaElements[cat].map((e) => (toUpdate.has(e.id) ? { ...e, ...patch } : e)),
        },
      };
    }),
  removeAreaElement: (cat, id) =>
    set((s) => ({
      areaElements: { ...s.areaElements, [cat]: s.areaElements[cat].filter((e) => e.id !== id) },
    })),
  removeAreaElements: (cat, ids) =>
    set((s) => {
      const toRemove = new Set(ids);
      return {
        areaElements: {
          ...s.areaElements,
          [cat]: s.areaElements[cat].filter((e) => !toRemove.has(e.id)),
        },
      };
    }),
  clearAreaElements: (cat) =>
    set((s) => ({ areaElements: { ...s.areaElements, [cat]: [] } })),
  consolidateAreaElements: (cat) => {
    const before = get().areaElements[cat].length;
    const merged = consolidateAreaBased(get().areaElements[cat]);
    set((s) => ({ areaElements: { ...s.areaElements, [cat]: merged } }));
    return { before, after: merged.length };
  },
  importAreaElements: (cat, rows, mode) =>
    set((s) => {
      const newEls: AreaElement[] = rows.map((r) => ({ ...r, id: newId() }));
      return {
        areaElements: {
          ...s.areaElements,
          [cat]: mode === 'replace' ? newEls : [...s.areaElements[cat], ...newEls],
        },
      };
    }),

  // Windows
  addWindowElement: () =>
    set((s) => ({ windowElements: [...s.windowElements, seedWindow()] })),
  updateWindowElement: (id, patch) =>
    set((s) => ({
      windowElements: s.windowElements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  updateWindowElements: (ids, patch) =>
    set((s) => {
      const toUpdate = new Set(ids);
      return {
        windowElements: s.windowElements.map((e) =>
          toUpdate.has(e.id) ? { ...e, ...patch } : e,
        ),
      };
    }),
  removeWindowElement: (id) =>
    set((s) => ({ windowElements: s.windowElements.filter((e) => e.id !== id) })),
  removeWindowElements: (ids) =>
    set((s) => {
      const toRemove = new Set(ids);
      return { windowElements: s.windowElements.filter((e) => !toRemove.has(e.id)) };
    }),
  clearWindowElements: () => set({ windowElements: [] }),
  consolidateWindowElements: () => {
    const before = get().windowElements.length;
    const merged = consolidateWindows(get().windowElements);
    set({ windowElements: merged });
    return { before, after: merged.length };
  },
  importWindowElements: (rows, mode) =>
    set((s) => {
      const newEls: WindowElement[] = rows.map((r) => ({ ...r, id: newId() }));
      return {
        windowElements: mode === 'replace' ? newEls : [...s.windowElements, ...newEls],
      };
    }),

  // Lifecycle (interior walls, floors)
  addLifecycleElement: (cat) =>
    set((s) => ({
      lifecycleElements: {
        ...s.lifecycleElements,
        [cat]: [
          ...s.lifecycleElements[cat],
          cat === 'interiorWalls' ? seedInteriorWall() : seedFloor(),
        ],
      },
    })),
  updateLifecycleElement: (cat, id, patch) =>
    set((s) => ({
      lifecycleElements: {
        ...s.lifecycleElements,
        [cat]: (s.lifecycleElements[cat] as Array<InteriorWallElement | FloorElement>).map((e) =>
          e.id === id ? { ...e, ...patch } : e,
        ) as InteriorWallElement[] & FloorElement[],
      },
    })),
  updateLifecycleElements: (cat, ids, patch) =>
    set((s) => {
      const toUpdate = new Set(ids);
      return {
        lifecycleElements: {
          ...s.lifecycleElements,
          [cat]: (s.lifecycleElements[cat] as Array<InteriorWallElement | FloorElement>).map((e) =>
            toUpdate.has(e.id) ? { ...e, ...patch } : e,
          ) as InteriorWallElement[] & FloorElement[],
        },
      };
    }),
  removeLifecycleElement: (cat, id) =>
    set((s) => ({
      lifecycleElements: {
        ...s.lifecycleElements,
        [cat]: (s.lifecycleElements[cat] as Array<InteriorWallElement | FloorElement>).filter(
          (e) => e.id !== id,
        ) as InteriorWallElement[] & FloorElement[],
      },
    })),
  removeLifecycleElements: (cat, ids) =>
    set((s) => {
      const toRemove = new Set(ids);
      return {
        lifecycleElements: {
          ...s.lifecycleElements,
          [cat]: (s.lifecycleElements[cat] as Array<InteriorWallElement | FloorElement>).filter(
            (e) => !toRemove.has(e.id),
          ) as InteriorWallElement[] & FloorElement[],
        },
      };
    }),
  clearLifecycleElements: (cat) =>
    set((s) => ({
      lifecycleElements: {
        ...s.lifecycleElements,
        [cat]: [] as InteriorWallElement[] & FloorElement[],
      },
    })),
  consolidateLifecycleElements: (cat) => {
    const existing = get().lifecycleElements[cat] as Array<InteriorWallElement | FloorElement>;
    const before = existing.length;
    const merged = consolidateAreaBased(existing);
    set((s) => ({
      lifecycleElements: {
        ...s.lifecycleElements,
        [cat]: merged as InteriorWallElement[] & FloorElement[],
      },
    }));
    return { before, after: merged.length };
  },
  importLifecycleElements: (cat, rows, mode) =>
    set((s) => {
      const newEls = rows.map((r) => ({ ...r, id: newId() })) as
        InteriorWallElement[] & FloorElement[];
      const existing = s.lifecycleElements[cat] as Array<InteriorWallElement | FloorElement>;
      const merged = (mode === 'replace' ? newEls : [...existing, ...newEls]) as
        InteriorWallElement[] & FloorElement[];
      return {
        lifecycleElements: { ...s.lifecycleElements, [cat]: merged },
      };
    }),
}));
