// DEMO DATA. Four illustrative ponds. Display names are "Pond 1" to "Pond 4"; ids are internal and never shown.
import type { Pond } from '@/types';

export const DEMO_AS_OF = '2026-10-12T10:30:00.000Z';

export const DEMO_PONDS: Pond[] = [
  { id: 'pond-1', displayName: 'Pond 1', speciesId: 'rohu', areaAcres: 2.5, notes: 'Demo pond with a critical oxygen reading.', localOnly: false },
  { id: 'pond-2', displayName: 'Pond 2', speciesId: 'catla', areaAcres: 2.0, notes: 'Demo pond with a pH warning and an offline temperature sensor.', localOnly: false },
  { id: 'pond-3', displayName: 'Pond 3', speciesId: 'mrigal', areaAcres: 3.0, notes: 'Demo pond with a high temperature warning.', localOnly: false },
  { id: 'pond-4', displayName: 'Pond 4', speciesId: 'vannamei', areaAcres: 1.5, notes: 'Demo pond with all readings in range.', localOnly: false },
];

export const pondById = (ponds: Pond[], id: string | undefined) => ponds.find((p) => p.id === id);
