import { createContext, useContext } from 'react';
import type { Catalogue } from './contracts';
export const CatalogueContext = createContext<Catalogue | null>(null);
export function useCatalogue(): Catalogue { const c=useContext(CatalogueContext);if(!c)throw new Error('Catalogue provider required');return c; }
