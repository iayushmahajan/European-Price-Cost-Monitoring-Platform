"""Deterministic illustrative API fixtures, validated by the real Pydantic contracts.
Run: PYTHONPATH=backend backend/.venv/bin/python frontend/scripts/build-price-cost-fixtures.py
No HTTP, database or ingestion operations. Backend calculation/templates generate findings.
"""
import json
from datetime import date
from decimal import Decimal
from pathlib import Path
from app.api.schemas import price_cost as s, price_cost_analyst as a
from app.services.price_cost.calculations import change, data_status, ratio
from app.services.price_cost.explanations import explain
from app.services.price_cost_analyst.presentation import present

D = Decimal
stamp = "2026-11-08T10:00:00Z"
names = {"DE": "Germany", "FR": "France", "EU27_2020": "European Union (27)"}
source_info = [
    ("ec_weekly_oil_bulletin", "European Commission · Weekly Oil Bulletin", "weekly", "2026-11-02", "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"),
    ("eurostat_prc_hicp_minr", "Eurostat · HICP", "monthly", "2026-10-01", "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table"),
    ("ecb_exr", "European Central Bank · EXR", "daily", "2026-11-03", "https://data.ecb.europa.eu/data/datasets/EXR"),
]
sources = [s.SourceStatus(source=s.Attribution(code=code,name=name,official_url=url,methodology="Illustrative contract fixture. Official measurement definitions apply."),available=True,running=False,expected_frequency=freq,latest_observation=period,observation_freshness="current",synchronization_status="current",last_success_at=stamp,last_attempt_at=stamp,freshness_policy="Fixture policy; not a live freshness assessment.",quality=s.QualitySummary()) for code,name,freq,period,url in source_info]
products = {"automotive_diesel": "Diesel", "euro_super_95": "Petrol (95)"}
units = {"annual_rate": "Annual inflation", "monthly_rate": "Monthly inflation", "index": "Price index (2025=100)"}
catnames = {"TOTAL": "All consumer items", "CP01": "Food and non-alcoholic drinks"}
quotes = {"GBP": "British pound", "USD": "US dollar", "CHF": "Swiss franc"}
histories = {}
metrics = []

def build(domain, country, category, measurement, tax, quote, dates, values):
    previous = None
    result = []
    source = sources[0 if domain == "fuel" else 1 if domain == "inflation" else 2]
    sid = len(histories) + 1
    for i,(day,value) in enumerate(zip(dates,values,strict=True)):
        p=date.fromisoformat(day);v=D(value)
        status=data_status("e" if domain=="inflation" and i==len(values)-1 else None,hicp=domain=="inflation")
        comparison=change(domain,measurement,p,v,previous)
        name=(products[category]+" in "+names[country]) if domain=="fuel" else names[country] if domain=="inflation" else quote+" per euro"
        explanation=explain(domain,name=name,value=v,period=p,comparison=comparison,measurement=measurement,category=catnames.get(category,""),quote=quote or "",tax_basis=tax or "with_tax",status=status)
        common=dict(observation_id=sid*100+i,series_id=sid,indicator_id=domain+"_"+measurement,indicator_name=products[category] if domain=='fuel' else units[measurement] if domain=='inflation' else 'ECB EUR/'+quote+' reference rate',period=p,value=v,status=status,source_code=source.source.code,observation_freshness="current",comparison=comparison,explanation=explanation,evidence_path=f"/v1/price-cost/evidence/{domain}/{sid*100+i}")
        if domain=="fuel": m=s.FuelMetric(**common,geography=s.NamedCode(code=country,name=names[country]),product=category,tax_basis=tax)
        elif domain=="inflation": m=s.InflationMetric(**common,geography=s.NamedCode(code=country,name=names[country]),category=s.NamedCode(code=category,name=catnames[category]),measurement_type=measurement,unit="index_points" if measurement=="index" else "percent",index_base_year=2025 if measurement=="index" else None)
        else:
            inverse_change=change(domain,measurement,p,ratio(D(1),v),
                                 (previous[0],ratio(D(1),previous[1]),previous[2]) if previous else None)
            inverse_change.absolute_change_unit="EUR/"+quote
            m=s.ExchangeMetric(**common,quote_currency=quote,unit=quote+"/EUR",source_precision=5,inverse_rate=ratio(D(1),v),inverse_unit="EUR/"+quote,inverse_is_derived=True,inverse_comparison=inverse_change)
        result.append(m);metrics.append(m);previous=(p,v,status.source_status)
    return result

for geo in ["DE","FR"]:
    for product in products:
        for tax in ["with_tax","without_tax"]:
            offset=(D('-.12') if geo=='FR' else D(0))+(D('-.154') if product=='euro_super_95' else D(0))
            vals=[(D(v)+offset)*(D('.6') if tax=='without_tax' else D(1)) for v in ['2.15','2.18','2.232','2.282']]
            key=f"fuel:{geo}:{product}:{tax}"
            histories[key]=s.FuelResponse(available=True,missing_selections=[],sources=[sources[0]],items=build('fuel',geo,product,'price',tax,None,['2026-10-12','2026-10-19','2026-10-26','2026-11-02'],vals))
for geo in names:
    for category in catnames:
        for measure in units:
            vals={'annual_rate':['2.2','2.0','2.3','2.9','3.3','2.8'],'monthly_rate':['.2','.1','.3','.2','.6','-.1'],'index':['102.8','103.1','103.2','103.36','103.93','103.8']}[measure]
            offset=(D('-.3') if geo=='FR' else D(0))+(D('.8') if category=='CP01' else D(0))
            histories[f'inflation:{geo}:{category}:{measure}']=s.InflationResponse(available=True,missing_selections=[],sources=[sources[1]],items=build('inflation',geo,category,measure,None,None,[f'2026-{month:02}-01' for month in range(5,11)],[D(v)+offset for v in vals]))
for quote in quotes:
    offset={'GBP':D(0),'USD':D('.25282'),'CHF':D('.10762')}[quote]
    histories[f'exchange-rates:{quote}']=s.ExchangeResponse(available=True,missing_selections=[],sources=[sources[2]],items=build('exchange-rates',None,None,'reference_rate',None,quote,['2026-10-30','2026-11-02','2026-11-03'],[D(v)+offset for v in ['.83482','.83448','.83358']]))
coverage=[]
for response in histories.values():
    m=response.items[-1]
    coverage.append(s.Coverage(series_id=m.series_id,source_code=m.source_code,geography_code=getattr(getattr(m,'geography',None),'code',None),category_code=m.product.value if isinstance(m,s.FuelMetric) else m.category.code if isinstance(m,s.InflationMetric) else None,measurement_type=m.measurement_type,tax_basis=m.tax_basis.value if isinstance(m,s.FuelMetric) else None,quote_currency=m.quote_currency if isinstance(m,s.ExchangeMetric) else None,unit_code=m.unit,first_period=response.items[0].period,latest_period=m.period))
catalogue=s.Catalogue(geographies=[s.NamedCode(code=k,name=v) for k,v in names.items()],fuel_products=[s.NamedCode(code=k,name=v) for k,v in products.items()],inflation_categories=[s.NamedCode(code=k,name=v) for k,v in catnames.items()],inflation_measurements=[s.NamedCode(code=k,name=v) for k,v in units.items()],quote_currencies=[s.NamedCode(code=k,name=v) for k,v in quotes.items()],coverage=coverage)
comparisons={}
specs=[('fuel',product,'price',tax) for product in products for tax in ['with_tax','without_tax']]+[('inflation',category,measurement,None) for category in catnames for measurement in ['annual_rate','monthly_rate']]
for domain,code,measurement,tax in specs:
    geos=['DE','FR'] if domain=='fuel' else list(names)
    for base_geo in geos:
        for other_geo in geos:
            if base_geo==other_geo: continue
            points=[histories[f'fuel:{geo}:{code}:{tax}' if domain=='fuel' else f'inflation:{geo}:{code}:{measurement}'].items[-1] for geo in [base_geo,other_geo]]
            base=points[0]
            key=f'{domain}:{base_geo}:{other_geo}:{code}:{tax if domain=="fuel" else measurement}'
            comparisons[key]=s.CountryComparison(available=True,period=base.period,base_geography=base_geo,category_or_product=code,measurement_type=measurement,tax_basis=tax,unit=base.unit,missing_selections=[],sources=[sources[0 if domain=='fuel' else 1]],explanation=s.Explanation(what_changed=f'{names[other_geo]} and {names[base_geo]} are compared at the same reference period.',what_it_means='These are same-period differences, not changes over time.',why_it_might_matter='National indicators provide comparison context; actual costs may differ.',limitations=['Illustrative contract fixture.']),items=[s.CountryDifference(geography=m.geography,value=m.value,difference_from_base=m.value-base.value,difference_unit='EUR/litre' if domain=='fuel' else 'percentage_points',relative_difference_percent=ratio(m.value-base.value,base.value,D(100)) if domain=='fuel' else None,observation_id=m.observation_id,status=m.status) for m in points])
comparisons['fuel']=comparisons['fuel:DE:FR:automotive_diesel:with_tax']
comparisons['inflation']=comparisons['inflation:DE:FR:TOTAL:annual_rate']
evidence={}
frozen=[]
for m in metrics:
    domain='fuel' if isinstance(m,s.FuelMetric) else 'inflation' if isinstance(m,s.InflationMetric) else 'exchange-rates'
    source=next(s0 for s0 in sources if s0.source.code==m.source_code)
    original={'value':m.value,'source_status':m.status.source_status}
    if domain=='fuel':original.update(raw_value=m.value*1000,raw_unit='EUR/1000_litres')
    artifact=s.EvidenceArtifact(id=1,url=source.source.official_url,sha256='a'*64,retrieved_at=stamp,publication_date=None,published_at=None,source_updated_at=None)
    ev=s.Evidence(domain=domain,observation_id=m.observation_id,series_id=m.series_id,period=m.period,source=source.source,source_series_key=f'fixture:{m.series_id}',unit_code=m.unit,geography_code=getattr(getattr(m,'geography',None),'code',None),category_code=getattr(getattr(m,'category',None),'code',None),tax_basis=m.tax_basis.value if isinstance(m,s.FuelMetric) else None,ingestion_run_id=1,imported_at=stamp,observation_publication_date=None,original_values=original,artifact=artifact,revision_artifacts=[artifact],revisions=[s.RevisionEvidence(detected_at=stamp,previous_run_id=1,replacement_run_id=2,previous_artifact_id=1,replacement_artifact_id=1,previous={'value':str(m.value),'source_status':None},replacement={'value':str(m.value),'source_status':'p'})],revisions_has_more=False)
    evidence[str(m.observation_id)]=ev
    if m.observation_id in [i.observation_id for i in comparisons['fuel'].items]:
        frozen.append(a.ObservationEvidence(observation_id=m.observation_id,series_id=m.series_id,source_code=m.source_code,period=m.period,value=m.value,unit=m.unit,status=m.status.source_status,raw_value=m.value*1000,raw_unit='EUR/1000_litres',ingestion_run_id=1,imported_at=stamp,artifact_id=1,sha256='a'*64,source_url=source.source.official_url,retrieved_at=stamp,observation_publication_date=None,artifact_publication_date=None,source_updated_at=None,evidence_path=m.evidence_path))
operation=a.FuelCompareOperation(kind='fuel_compare',query=dict(countries='DE,FR',base_country='DE',product='automotive_diesel',tax_basis='with_tax'))
analysis=a.AnalysisResponse(id=1,request_id='fixture-analyst',question='Compare diesel prices in Germany and France.',status='success',plan=a.ReadyPlan(status='ready',operation=operation),domain='fuel',created_at=stamp,assessment_date='2026-11-08')
present(analysis,operation,a.CountryResult(domain='fuel',data=comparisons['fuel']),frozen)
analysis=a.AnalysisResponse.model_validate(analysis.model_dump())
def dump(obj):
    if hasattr(obj,'model_dump'):return obj.model_dump(mode='json')
    if isinstance(obj,dict):return {k:dump(v) for k,v in obj.items()}
    if isinstance(obj,list):return [dump(v) for v in obj]
    return obj
from app.services.price_cost.insights import summary, insights_for_metrics
from app.services.price_cost.context import comparison_context
historical_comparisons = {}
for key, comparison in comparisons.items():
    if not key.startswith('fuel:'):
        continue
    _, base_geo, peer_geo, product, tax = key.split(':')
    base_items = histories[f'fuel:{base_geo}:{product}:{tax}'].items
    peer_items = histories[f'fuel:{peer_geo}:{product}:{tax}'].items
    pairs = [s.MatchedFuelWeek(period=b.period, base=b, peer=p, gap=p.value-b.value,
                              consecutive=None if i == 0 else True)
             for i, (b,p) in enumerate(zip(base_items,peer_items))]
    delta=abs(pairs[-1].gap)-abs(pairs[0].gap)
    historical_comparisons[key]=s.FuelHistoryComparison(
        available=True, latest=comparison, observations=pairs, insights=comparison_context(pairs),
        summaries=[s.FuelPeriodSummary(geography=group[0].geography, history=summary(group))
                   for group in [base_items,peer_items]], unmatched_weeks=[],
        absolute_gap_change=delta, gap_direction='widened' if delta>0 else 'narrowed' if delta<0 else 'unchanged')
insights={}
for key,response in histories.items():
    domain=key.split(':')[0]
    for i,metric in [(len(response.items)-1, response.items[-1])]:
        supporting, aggregate = [], None
        if domain == 'inflation':
            index_items = histories[f'inflation:{metric.geography.code}:{metric.category.code}:index'].items
            target = date(metric.period.year-1,metric.period.month,1) if metric.measurement_type == 'annual_rate' else date(metric.period.year,metric.period.month-1,1) if metric.measurement_type == 'monthly_rate' else index_items[0].period
            old = next((p for p in index_items if p.period == target),None)
            current = next((p for p in index_items if p.period == metric.period),None)
            supporting = [old,current] if old is not None and current is not None else []
            if metric.measurement_type != 'index':
                aggregate = histories[f'inflation:EU27_2020:{metric.category.code}:{metric.measurement_type}'].items[-1]
        insights[f'{domain}/{metric.observation_id}']=insights_for_metrics(domain,metric,response.items[max(0,i-11):i+1],indices=supporting,aggregate=aggregate)
        if domain=='exchange-rates':
            insights[f'{domain}/{metric.observation_id}?inverse=true']=insights_for_metrics(domain,metric,response.items[max(0,i-11):i+1],inverse=True)
output=dict(catalogue=catalogue,sources=sources,histories=histories,comparisons=comparisons,evidence=evidence,analysis=analysis,historical_comparisons=historical_comparisons,insights=insights)
Path('frontend/src/test/price-cost.json').write_text(json.dumps(dump(output),indent=2)+'\n')
print(f'Validated fixture: {len(histories)} series, {len(metrics)} observations, analyst snapshot and provenance. All illustrative.')
