"""Versioned, bounded read APIs for official European price/cost information."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.orm import Session

from app.api.schemas import price_cost as s
from app.api.schemas import price_cost_queries as q
from app.services.price_cost.product import ProductService
from app.services.price_cost.repository import get_price_cost_db

router = APIRouter(prefix="/v1/price-cost", tags=["price-cost-v1"])


def get_service(session: Annotated[Session, Depends(get_price_cost_db)]):
    return ProductService(session)


Service = Annotated[ProductService, Depends(get_service)]


def fuel_filters(query):
    return dict(
        countries=tuple(query.countries.split(",")) if hasattr(query, "countries") else (query.country,),
        product=query.product.value if query.product else None,
        tax_basis=query.tax_basis.value,
    )


def inflation_filters(query):
    return dict(
        countries=tuple(query.countries.split(",")) if hasattr(query, "countries") else (query.country,),
        category=query.category,
        measurement=query.measurement,
    )


@router.get("/catalogue", response_model=s.Catalogue)
def catalogue(service: Service):
    return service.catalogue()


@router.get("/sources", response_model=list[s.SourceStatus])
def sources(service: Service):
    return service.sources()


@router.get("/overview", response_model=s.Overview)
def overview(query: Annotated[q.OverviewQuery, Query()], service: Service):
    return service.overview(query.country, query.currency, query.as_of)


@router.get("/fuel/latest", response_model=s.FuelResponse)
def fuel_latest(query: Annotated[q.FuelLatestQuery, Query()], service: Service):
    return service.latest("fuel", as_of=query.as_of, **fuel_filters(query))


@router.get("/fuel/history", response_model=s.FuelResponse)
def fuel_history(query: Annotated[q.FuelHistoryQuery, Query()], service: Service):
    return service.history("fuel", start=query.start, end=query.end, limit=query.limit, order=query.order, **fuel_filters(query))


@router.get("/fuel/compare", response_model=s.CountryComparison)
def fuel_compare(query: Annotated[q.FuelCompareQuery, Query()], service: Service):
    return service.compare_countries(
        "fuel", base_country=query.base_country, period=query.period, as_of=query.as_of, **fuel_filters(query)
    )


@router.get("/inflation/latest", response_model=s.InflationResponse)
def inflation_latest(query: Annotated[q.InflationLatestQuery, Query()], service: Service):
    return service.latest("inflation", as_of=query.as_of, **inflation_filters(query))


@router.get("/inflation/history", response_model=s.InflationResponse)
def inflation_history(query: Annotated[q.InflationHistoryQuery, Query()], service: Service):
    return service.history(
        "inflation", start=query.start, end=query.end, limit=query.limit, order=query.order, **inflation_filters(query)
    )


@router.get("/inflation/compare", response_model=s.CountryComparison)
def inflation_compare(query: Annotated[q.InflationCompareQuery, Query()], service: Service):
    return service.compare_countries(
        "inflation",
        base_country=query.base_country,
        period=query.period,
        as_of=query.as_of,
        **inflation_filters(query),
    )


@router.get("/exchange-rates/latest", response_model=s.ExchangeResponse)
def exchange_latest(query: Annotated[q.ExchangeLatestQuery, Query()], service: Service):
    return service.latest(
        "exchange-rates",
        currencies=tuple(query.currencies.split(",")),
        as_of=query.as_of,
        inverse=query.inverse,
        comparison_date=query.comparison_date,
    )


@router.get("/exchange-rates/history", response_model=s.ExchangeResponse)
def exchange_history(query: Annotated[q.ExchangeHistoryQuery, Query()], service: Service):
    return service.history(
        "exchange-rates",
        currencies=(query.currency,),
        start=query.start,
        end=query.end,
        limit=query.limit,
        order=query.order,
        inverse=query.inverse,
    )


@router.get("/evidence/{domain}/{observation_id}", response_model=s.Evidence)
def evidence(
    domain: s.Domain,
    observation_id: Annotated[int, Path(ge=1, le=9223372036854775807)],
    service: Service,
    revision_limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    found = service.evidence(domain, observation_id, revision_limit)
    if found is None:
        raise HTTPException(status_code=404, detail="Observation not found in the selected domain")
    return found


@router.get("/fuel/compare-history", response_model=s.FuelHistoryComparison)
def fuel_compare_history(query: Annotated[q.FuelHistoryCompareQuery, Query()], service: Service):
    from app.services.price_cost.insights import fuel_history_comparison
    return fuel_history_comparison(service, base_country=query.base_country, period=query.period,
                                   as_of=query.as_of, **fuel_filters(query))


@router.get("/insights/{domain}/{observation_id}", response_model=s.MeasurementInsights)
def insights(domain: s.Domain, observation_id: Annotated[int, Path(ge=1, le=9223372036854775807)],
             service: Service, inverse: bool = False, comparison_date: date | None = None):
    from app.services.price_cost.insights import measurement_insights
    if inverse and domain != "exchange-rates":
        raise HTTPException(422, "Inverse direction applies only to exchange rates")
    try:
        found = measurement_insights(service, domain, observation_id, inverse=inverse, comparison_date=comparison_date)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if found is None:
        raise HTTPException(status_code=404, detail="Observation not found in the selected domain")
    return found
