"""Execute one approved operation through M4 services in one read-only snapshot."""

from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select, tuple_

from app.api.schemas import price_cost_analyst as a
from app.core.config import settings
from app.core.db import engine
from app.models import price_cost as m
from app.services.price_cost.calculations import difference, ratio
from app.services.price_cost.product import ProductService, artifact_evidence
from app.services.price_cost.repository import DOMAINS, read_session


class ExecutionLimitError(Exception):
    pass


def domain_for(operation):
    return (
        "inflation"
        if operation.kind.startswith("inflation")
        else "exchange-rates"
        if operation.kind.startswith(("exchange", "supported"))
        else "fuel"
    )


def filters(query, domain):
    if domain == "exchange-rates":
        return dict(
            currencies=tuple(query.currencies.split(","))
            if hasattr(query, "currencies")
            else (query.currency,)
        )
    selected = dict(
        countries=tuple(query.countries.split(",")) if hasattr(query, "countries") else (query.country,)
    )
    if domain == "fuel":
        selected.update(
            product=query.product.value if query.product else None, tax_basis=query.tax_basis.value
        )
    else:
        selected.update(category=query.category, measurement=query.measurement)
    return selected


def observation_points(result):
    return (
        result.data.items
        if isinstance(result, (a.FuelResult, a.InflationResult, a.ExchangeResult))
        else result.items
        if isinstance(result, a.TaxResult)
        else []
    )


def sources(result):
    return result.data.sources if hasattr(result, "data") else result.sources


def collect_evidence(service, domain, result):
    """Batch current AND comparison references; store original hashes/values for exact restores."""
    points = observation_points(result)
    ids = {point.observation_id for point in points}
    if isinstance(result, a.CountryResult):
        ids = {point.observation_id for point in result.data.items}
    if not ids:
        return []
    model, field, _, _ = DOMAINS[domain]

    def statement():
        return (
            select(model, m.SourceArtifact, m.IngestionRun)
            .join(m.SourceArtifact, model.artifact_id == m.SourceArtifact.id)
            .join(m.IngestionRun, model.ingestion_run_id == m.IngestionRun.id)
        )

    records = list(service.repo.session.execute(statement().where(model.id.in_(ids))))
    pairs = {
        (point.series_id, point.comparison.reference_period) for point in points if point.comparison.available
    }
    if pairs:
        records.extend(
            service.repo.session.execute(
                statement().where(tuple_(model.series_id, getattr(model, field)).in_(pairs))
            )
        )
    evidence = {}
    for row, artifact, run in records:
        metadata = artifact_evidence(artifact)
        evidence[row.id] = a.ObservationEvidence(
            observation_id=row.id,
            series_id=row.series_id,
            source_code=row.source_code,
            period=getattr(row, field),
            value=service.value(domain, row),
            unit=(
                "EUR/litre"
                if domain == "fuel"
                else "index_points"
                if domain == "inflation" and row.measurement_type == "index"
                else "percent"
                if domain == "inflation"
                else f"{row.quote_currency_code}/EUR"
            ),
            source_attributes={
                field: getattr(row, field)
                for field in (
                    ("measurement_type", "index_base_year")
                    if domain == "inflation"
                    else ("base_currency_code", "quote_currency_code", "source_precision", "confidentiality")
                    if domain == "exchange-rates"
                    else ("raw_unit_code",)
                )
            },
            status=row.status,
            raw_value=getattr(row, "raw_value", None),
            raw_unit=getattr(row, "raw_unit_code", None),
            ingestion_run_id=run.id,
            imported_at=run.completed_at,
            artifact_id=artifact.id,
            sha256=artifact.sha256,
            source_url=artifact.source_url,
            retrieved_at=artifact.retrieved_at,
            observation_publication_date=getattr(row, "publication_date", None),
            artifact_publication_date=metadata.publication_date,
            source_updated_at=metadata.source_updated_at,
            evidence_path=f"/v1/price-cost/evidence/{domain}/{row.id}",
        )
    if len(evidence) > 200:
        raise ExecutionLimitError("Evidence exceeds the response bound")
    return sorted(evidence.values(), key=lambda row: (row.series_id, row.period))


def tax_comparison(service, query):
    series = service.repo.series("fuel", countries=(query.country,), product=query.product.value)
    period = query.period
    if period is None and {row.tax_basis for row in series} == {"with_tax", "without_tax"}:
        end = query.as_of or service.today
        period = service.repo.common_period("fuel", series, end - timedelta(days=400), end)
    items = []
    if period:
        for basis in ("with_tax", "without_tax"):
            data = service.latest(
                "fuel", countries=(query.country,), product=query.product.value, tax_basis=basis, as_of=period
            )
            if data.items and data.items[0].period == period:
                items.append(data.items[0])
    available = len(items) == 2
    gap = difference(items[0].value, items[1].value) if available else None
    return a.TaxResult(
        available=available,
        items=items if available else [],
        difference_eur_per_litre=gap,
        relative_difference_percent=ratio(gap, items[1].value, Decimal(100)) if available else None,
        sources=[service.source_status("fuel")],
    )


def execute_operation(operation):
    domain = domain_for(operation)
    query = getattr(operation, "query", None)
    max_rows = min(100, settings.MAX_SQL_ROWS)
    if query is not None and hasattr(query, "limit") and query.limit > max_rows:
        raise ExecutionLimitError("Requested history exceeds the configured row bound")
    with read_session(engine) as session:
        service = ProductService(session)
        if operation.kind == "supported_currencies":
            result = a.CurrenciesResult(
                items=service.catalogue().quote_currencies, sources=[service.source_status(domain)]
            )
        elif operation.kind == "fuel_tax_comparison":
            result = tax_comparison(service, query)
        elif operation.kind.endswith("_compare"):
            result = a.CountryResult(
                domain=domain,
                data=service.compare_countries(
                    domain,
                    base_country=query.base_country,
                    period=query.period,
                    as_of=query.as_of,
                    **filters(query, domain),
                ),
            )
        else:
            arguments = filters(query, domain)
            if domain == "exchange-rates":
                arguments["inverse"] = query.inverse
            if operation.kind.endswith("_history"):
                data = service.history(
                    domain, start=query.start, end=query.end, limit=query.limit, **arguments
                )
            else:
                if domain == "exchange-rates":
                    arguments["comparison_date"] = query.comparison_date
                data = service.latest(domain, as_of=query.as_of, **arguments)
            result = {
                "fuel": a.FuelResult,
                "inflation": a.InflationResult,
                "exchange-rates": a.ExchangeResult,
            }[domain](data=data)
        rows = len(result.data.items) if hasattr(result, "data") else len(result.items)
        if rows > max_rows:
            raise ExecutionLimitError("Result exceeds the configured row bound")
        return result, collect_evidence(service, domain, result), service.today
