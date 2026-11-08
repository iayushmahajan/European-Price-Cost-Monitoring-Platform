import { expect, it } from 'vitest';
import { pcFixture } from '../test/price-cost-fixtures';
import { parseSelection, shiftMonths, isoDate } from './selection';
import { metricPoints } from './chart-data';
it('validates URL scope, aggregate restrictions and date windows before requests',()=>{
 const s=parseSelection(new URLSearchParams('domain=fuel&country=EU27_2020&product=bogus&compare=DE&start=2026-02-31&end=2026-10-01'),pcFixture.catalogue);
 expect(s.country).toBe('DE');expect(s.product).toBe('automotive_diesel');expect(s.compare).toBe('');expect(s.error).toMatch(/valid range/);
 const index=parseSelection(new URLSearchParams('domain=inflation&measurement=index&compare=FR&start=2026-01-02&end=2026-10-01'),pcFixture.catalogue);
 expect(index.compare).toBe('');expect(index.error).toMatch(/first day/);
 expect(isoDate('2026-02-29')).toBe(false);expect(shiftMonths('2026-03-31',-1)).toBe('2026-02-28');
});
it('creates a chart gap, never a zero, for backend nonconsecutive periods',()=>{
 const m=pcFixture.histories['fuel:DE:automotive_diesel:with_tax'].items.at(-1)!;
 const data=metricPoints([{...m,comparison:{...m.comparison,consecutive:false}}]);
 expect(data).toHaveLength(2);expect(data[0].gap).toBe(true);expect(data[1].value).toBe(m.value);
});
