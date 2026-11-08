import type { Selection } from '../selection';
import { filters } from '../selection';
import { priceCost } from '../api';
import { useResource } from '../resource';
import { ResourceState, State } from './Shared';
import { MetricSummary } from './MetricSummary';
import { SourceWarnings } from './Evidence';
import { History } from './History';
export function SeriesView({selection:s,onView}:{selection:Selection;onView:(table:boolean)=>void}) {
  const query={...filters(s),as_of:s.end,...(s.domain==='exchange-rates'&&s.comparisonDate?{comparison_date:s.comparisonDate}:{})};
  const latest=useResource('latest:'+s.domain+JSON.stringify(query),signal=>priceCost.metrics(s.domain,'latest',query,signal));
  return <section className="pc-canvas pc-analysis"><ResourceState resource={latest}>{d=><><SourceWarnings sources={d.sources}/>{d.items.length?<MetricSummary metric={d.items[0]} inverse={s.inverse}/>:<State empty={'No latest observation for this selection. '+d.missing_selections.join(', ')}/>}</>}</ResourceState><History domain={s.domain} params={{...filters(s,true),start:s.start,end:s.end,limit:'260'}} table={s.view==='table'} inverse={s.inverse} onView={onView}/></section>;
}
