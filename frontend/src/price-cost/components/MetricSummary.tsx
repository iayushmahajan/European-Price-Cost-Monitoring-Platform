import { useState } from 'react';
import { Info } from 'lucide-react';
import type { Metric } from '../api';
import { changeText, decimal, metricUnit, metricValue, period } from '../format';
import { Definition, StatusFlags } from './Evidence';
import EvidencePanel from './Evidence';
export function MetricSummary({metric,inverse=false}:{metric:Metric;inverse?:boolean}) {
  const [panel,setPanel]=useState<'definition'|'evidence'|null>(null);
  const fx=metric.measurement_type==='reference_rate';
  return <><div className="pc-metric"><div className="pc-metric-header"><h2>{metric.indicator_name}</h2><span>{period(metric.period,metric.period_type==='reference_month')}</span></div><p className="pc-note">{metric.measurement_type==='price'?(metric.tax_basis==='with_tax'?'Including taxes':'Excluding taxes'):metric.measurement_type!=='reference_rate'?metric.category.name:null}</p><div className="pc-value">{metricValue(metric)}<span>{metricUnit(metric)}</span></div>{fx&&<p className="pc-note">Official direction: 1 EUR = {metric.value} {metric.quote_currency}. Reference rate, not a transaction quote.</p>}{inverse&&fx&&metric.inverse_rate!==null&&<p className="pc-inverse">Derived inverse: 1 {metric.quote_currency} = <strong title={metric.inverse_rate}>{decimal(metric.inverse_rate,6)}</strong> EUR</p>}<p className="pc-change">{changeText(metric)}</p><StatusFlags status={metric.status}/>{metric.observation_freshness==='stale'&&<span className="pc-status">Potentially stale observation</span>}{metric.comparison.consecutive===false&&<p className="pc-notice">Irregular comparison interval: {metric.comparison.elapsed_days} days. This is not an ordinary consecutive-period change.</p>}<div className="pc-metric-actions"><button className="pc-text-link" onClick={()=>setPanel('definition')}><Info/>Read this number</button><button className="pc-text-link" onClick={()=>setPanel('evidence')}>Inspect source evidence ↗</button></div></div>{panel==='definition'&&<Definition explanation={metric.explanation} onClose={()=>setPanel(null)}/>} {panel==='evidence'&&<EvidencePanel path={metric.evidence_path} onClose={()=>setPanel(null)}/>}</>;
}
