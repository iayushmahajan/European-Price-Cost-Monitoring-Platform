"""Compose typed product responses from fixed reads, shared calculations and templates."""

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.api.schemas import price_cost as s
from app.data_sources.ecb import DEFAULT_CURRENCIES
from app.data_sources.hicp import HICP_CATEGORIES, HICP_GEOS
from app.ingestion.freshness import freshness, source_today
from app.ingestion.mapping import ECB_FIELDS, FUEL_FIELDS, HICP_FIELDS
from app.models import price_cost as m
from app.services.price_cost.calculations import change, data_status, difference, ratio
from app.services.price_cost.explanations import FUEL_LIMITS, HICP_LIMITS, explain
from app.services.price_cost.repository import DOMAINS, Repository

PRODUCT_NAMES = {"euro_super_95": "Petrol (Euro-super 95)", "automotive_diesel": "Automotive diesel"}
MEASUREMENT_NAMES = {
    "annual_rate": "Annual inflation rate",
    "monthly_rate": "Monthly inflation rate",
    "index": "Consumer price index (2025=100)",
}
POLICIES = {
    "fuel": "Weekly reference dates; stale after 14 days.",
    "inflation": "Monthly periods; stale after 65 days from the represented month's first day.",
    "exchange-rates": "Previous completed TARGET publication day; weekends and standard TARGET holidays excluded.",
}
METHODOLOGY = {
    "fuel": "Reported national motor-fuel consumer prices; EUR/1,000 litres divided by 1,000; tax bases remain separate.",
    "inflation": "Eurostat prc_hicp_minr; published monthly/annual percentage rates or 2025-based index; country baskets differ.",
    "exchange-rates": "ECB EXR daily spot reference rates; 1 EUR equals X quote-currency units; informational reference only.",
}


def metadata_date(value):
    try:
        return date.fromisoformat(value) if value else None
    except (ValueError, TypeError):
        return None


def metadata_timestamp(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
    except (ValueError, TypeError, AttributeError):
        return None


def artifact_evidence(artifact):
    return s.EvidenceArtifact(
        id=artifact.id,
        url=artifact.source_url,
        sha256=artifact.sha256,
        retrieved_at=artifact.retrieved_at,
        publication_date=metadata_date(artifact.source_metadata.get("publication_date")),
        published_at=artifact.published_at,
        source_updated_at=metadata_timestamp(artifact.source_metadata.get("source_updated_at")),
    )


class ProductService:
    def __init__(self, session, *, today=None):
        self.repo = Repository(session)
        self.today = today or source_today()
        self.geographies, self.categories = self.repo.names()
        self._sources = {}

    def attribution(self, domain, record=None):
        record = record or self.repo.session.get(m.DataSource, DOMAINS[domain][2])
        return s.Attribution(
            code=record.code,
            name=record.name,
            official_url=record.official_url,
            methodology=METHODOLOGY[domain],
        )

    def source_status(self, domain):
        if domain in self._sources:
            return self._sources[domain]
        source = DOMAINS[domain][2]
        record, state, run, successful, artifact, codes, publications = self.repo.source_context(source)
        known_publications = [parsed for value in publications if (parsed := metadata_date(value))]
        coverage = self.repo.coverage(domain)
        ends = [last for _, _, last in coverage if last]
        oldest = min(ends) if ends else None
        current = freshness(source, oldest, self.today) if ends else "unavailable"
        if ends and any(last is None for _, _, last in coverage):
            current = "stale"
        status = s.SourceStatus(
            source=self.attribution(domain, record),
            available=bool(ends),
            expected_frequency=record.default_frequency,
            latest_observation=max(ends) if ends else None,
            oldest_series_latest=oldest,
            observation_freshness=current,
            synchronization_status=state.status if state else "never_run",
            running=bool(run and run.status == "running"),
            last_attempt_at=state.last_attempt_at if state else None,
            last_success_at=state.last_success_at if state else None,
            source_updated_at=successful.source_updated_at if successful else None,
            latest_artifact_publication_date=max(known_publications)
            if known_publications
            else (metadata_date(artifact.source_metadata.get("publication_date")) if artifact else None),
            latest_artifact_published_at=artifact.published_at if artifact else None,
            freshness_policy=POLICIES[domain],
            quality=s.QualitySummary(
                checked_run_id=run.id if run else None,
                missing_cells_in_last_successful_check=successful.missing_count if successful else None,
                revised_observations_in_last_successful_check=successful.revision_count
                if successful
                else None,
                warning_or_error_codes=codes,
                sparse_absence_policy=(
                    "Missing cells are not zeros. A later sparse response may omit an already stored observation; its last verified value is retained."
                    if domain in {"fuel", "inflation"}
                    else None
                ),
            ),
        )
        self._sources[domain] = status
        return status

    def overview(self, country, currency, as_of=None):
        inflation = self.response("inflation", [], [])
        for measurement in MEASUREMENT_NAMES:
            supporting = self.latest(
                "inflation", countries=(country,), category="TOTAL", measurement=measurement, as_of=as_of
            )
            inflation.items.extend(supporting.items)
            inflation.missing_selections.extend(
                f"{code}:{measurement}" for code in supporting.missing_selections
            )
        inflation.available = bool(inflation.items)
        return s.Overview(
            geography=s.NamedCode(code=country, name=self.geographies[country]),
            fuel=self.latest("fuel", countries=(country,), product=None, tax_basis="with_tax", as_of=as_of),
            inflation=inflation,
            exchange_rates=self.latest("exchange-rates", currencies=(currency,), as_of=as_of),
        )

    def sources(self):
        return [self.source_status(domain) for domain in DOMAINS]

    def value(self, domain, row):
        return getattr(
            row,
            {
                "fuel": "normalized_price_eur_per_litre",
                "inflation": "value",
                "exchange-rates": "reference_rate",
            }[domain],
        )

    def period(self, domain, row):
        return getattr(row, DOMAINS[domain][1])

    def metric(self, domain, series, row, previous=None, *, inverse=False, comparison_date=None):
        value, period = self.value(domain, row), self.period(domain, row)
        baseline = (
            (self.period(domain, previous), self.value(domain, previous), previous.status)
            if previous
            else None
        )
        comparison = change(
            domain, series.measurement_type, period, value, baseline, requested=comparison_date
        )
        status = data_status(row.status, hicp=domain == "inflation")
        common = dict(
            observation_id=row.id,
            series_id=series.id,
            indicator_id=series.indicator_code,
            period=period,
            value=value,
            status=status,
            observation_freshness=freshness(DOMAINS[domain][2], period, self.today),
            source_code=series.source_code,
            comparison=comparison,
            evidence_path=f"/v1/price-cost/evidence/{domain}/{row.id}",
        )
        if domain == "fuel":
            product = series.category_code.lower()
            name = f"{PRODUCT_NAMES[product]} in {self.geographies[series.geography_code]}"
            return s.FuelMetric(
                **common,
                indicator_name=PRODUCT_NAMES[product],
                geography=s.NamedCode(
                    code=series.geography_code, name=self.geographies[series.geography_code]
                ),
                product=product,
                tax_basis=series.tax_basis,
                publication_date=row.publication_date,
                explanation=explain(
                    domain,
                    name=name,
                    value=value,
                    period=period,
                    comparison=comparison,
                    tax_basis=series.tax_basis,
                    status=status,
                ),
            )
        if domain == "inflation":
            category = self.categories[("ECOICOP_2018", series.category_code)]
            return s.InflationMetric(
                **common,
                indicator_name=MEASUREMENT_NAMES[series.measurement_type],
                geography=s.NamedCode(
                    code=series.geography_code, name=self.geographies[series.geography_code]
                ),
                category=s.NamedCode(code=series.category_code, name=category),
                unit="index_points" if series.measurement_type == "index" else "percent",
                measurement_type=series.measurement_type,
                index_base_year=row.index_base_year,
                explanation=explain(
                    domain,
                    name=self.geographies[series.geography_code],
                    value=value,
                    period=period,
                    comparison=comparison,
                    measurement=series.measurement_type,
                    category=category,
                    status=status,
                ),
            )
        quote = row.quote_currency_code
        inverse_change = None
        if inverse:
            inverse_change = change(
                domain, "reference_rate", period, ratio(Decimal(1), value),
                (self.period(domain, previous), ratio(Decimal(1), self.value(domain, previous)), previous.status)
                if previous else None, requested=comparison_date,
            )
            inverse_change.absolute_change_unit = f"EUR/{quote}"
        return s.ExchangeMetric(
            **common,
            indicator_name=f"ECB EUR/{quote} reference rate",
            quote_currency=quote,
            source_precision=row.source_precision,
            unit=f"{quote}/EUR",
            inverse_rate=ratio(Decimal(1), value) if inverse else None,
            inverse_unit=f"EUR/{quote}" if inverse else None,
            inverse_is_derived=True if inverse else None,
            inverse_comparison=inverse_change,
            explanation=explain(
                domain,
                name=f"ECB {quote} per euro reference rate",
                value=value,
                period=period,
                comparison=comparison,
                quote=quote,
                status=status,
            ),
        )

    def selection_key(self, domain, series):
        if domain == "fuel":
            return f"{series.geography_code}:{series.category_code.lower()}:{series.tax_basis}"
        return series.geography_code if domain == "inflation" else series.quote_currency_code

    def expected_keys(self, domain, filters):
        if domain == "fuel":
            return [
                f"{country}:{product}:{filters['tax_basis']}"
                for country in filters["countries"]
                for product in ([filters["product"]] if filters.get("product") else PRODUCT_NAMES)
            ]
        return list(filters["countries"] if domain == "inflation" else filters["currencies"])

    def response(self, domain, items, missing, page=None):
        response_type = {
            "fuel": s.FuelResponse,
            "inflation": s.InflationResponse,
            "exchange-rates": s.ExchangeResponse,
        }[domain]
        return response_type(
            available=bool(items),
            items=items,
            missing_selections=missing,
            sources=[self.source_status(domain)],
            page=page or s.PageInfo(),
        )

    def latest(self, domain, *, as_of=None, inverse=False, comparison_date=None, **filters):
        series = self.repo.series(domain, **filters)
        rows = self.repo.latest(domain, series, as_of or self.today)
        reference = self.repo.latest(domain, series, comparison_date, count=1) if comparison_date else {}
        items, present = [], set()
        for selected in series:
            observations = rows.get(selected.id, [])
            if not observations:
                continue
            previous = reference.get(selected.id, []) if comparison_date else observations[1:]
            items.append(
                self.metric(
                    domain,
                    selected,
                    observations[0],
                    previous[0] if previous else None,
                    inverse=inverse,
                    comparison_date=comparison_date,
                )
            )
            present.add(self.selection_key(domain, selected))
        missing = sorted(set(self.expected_keys(domain, filters)) - present)
        return self.response(domain, items, missing)

    def history(self, domain, *, start, end, limit, inverse=False, order="asc", **filters):
        series = self.repo.series(domain, **filters)
        if not series:
            return self.response(domain, [], self.expected_keys(domain, filters), s.PageInfo(limit=limit))
        selected = series[0]  # Routes constrain history to one complete semantic series.
        rows, previous, more = self.repo.history(domain, selected, start, end, limit, order=order)
        items = []
        for row in rows:
            items.append(self.metric(domain, selected, row, previous, inverse=inverse))
            previous = row
        next_start = None
        if more and order == "asc":
            last = self.period(domain, rows[-1])
            next_start = (
                date(last.year + last.month // 12, last.month % 12 + 1, 1)
                if domain == "inflation"
                else last + timedelta(days=1)
            )
        previous_end = self.period(domain, rows[0]) - timedelta(days=1) if more and order == "desc" else None
        if previous_end and domain == "inflation":
            previous_end = previous_end.replace(day=1)
        page = s.PageInfo(limit=limit, has_more=more, next_start=next_start, previous_end=previous_end)
        return self.response(domain, items, [] if items else self.expected_keys(domain, filters), page)

    def compare_countries(self, domain, *, countries, base_country, period=None, as_of=None, **filters):
        series = self.repo.series(domain, countries=countries, **filters)
        found = {item.geography_code for item in series}
        selected_period = period
        if period is None and found == set(countries):
            end = as_of or self.today
            selected_period = self.repo.common_period(domain, series, end - timedelta(days=400), end)
        rows = self.repo.latest(domain, series, selected_period, count=1) if selected_period else {}
        aligned = {
            item.geography_code: (item, rows[item.id][0])
            for item in series
            if rows.get(item.id) and self.period(domain, rows[item.id][0]) == selected_period
        }
        missing = sorted(set(countries) - set(aligned))
        # No partially aligned numerical comparison if any requested country is absent.
        items = []
        measure = filters.get("measurement", "price")
        unit = "EUR/litre" if domain == "fuel" else "percent"
        delta_unit = "EUR/litre" if domain == "fuel" else "percentage_points"
        if not missing:
            base = self.value(domain, aligned[base_country][1])
            for country in countries:
                _, row = aligned[country]
                value = self.value(domain, row)
                delta = difference(value, base)
                items.append(
                    s.CountryDifference(
                        geography=s.NamedCode(code=country, name=self.geographies[country]),
                        value=value,
                        difference_from_base=delta,
                        difference_unit=delta_unit,
                        relative_difference_percent=ratio(delta, base, Decimal(100))
                        if domain == "fuel"
                        else None,
                        observation_id=row.id,
                        status=data_status(row.status, hicp=domain == "inflation"),
                    )
                )
        explanation = s.Explanation(
            what_changed=(
                f"These are same-period differences from {self.geographies[base_country]} for {selected_period}; they are not changes over time."
                if items
                else "No comparison is available: every selected country needs the same reference period."
            ),
            what_it_means=(
                "Reported prices for the same fuel and tax basis are compared in EUR per litre for the same reference week."
                if domain == "fuel"
                else "Reported inflation rates for the same consumer category and measurement are compared in percentage points for the same month."
            ),
            why_it_might_matter="This can provide context for national indicators; it does not establish your own costs or explain causes.",
            limitations=list(FUEL_LIMITS if domain == "fuel" else HICP_LIMITS),
        )
        return s.CountryComparison(
            available=bool(items),
            period=selected_period,
            base_geography=base_country,
            category_or_product=filters.get("product") or filters["category"],
            measurement_type=measure,
            tax_basis=filters.get("tax_basis"),
            unit=unit,
            missing_selections=missing,
            items=items,
            sources=[self.source_status(domain)],
            explanation=explanation,
        )

    def catalogue(self):
        coverage = []
        for domain in DOMAINS:
            for series, first, last in self.repo.coverage(domain):
                coverage.append(
                    s.Coverage(
                        series_id=series.id,
                        source_code=series.source_code,
                        geography_code=series.geography_code,
                        category_code=series.category_code,
                        measurement_type=series.measurement_type,
                        tax_basis=series.tax_basis,
                        quote_currency=series.quote_currency_code,
                        unit_code=series.unit_code,
                        first_period=first,
                        latest_period=last,
                    )
                )
        return s.Catalogue(
            geographies=[s.NamedCode(code=code, name=self.geographies[code]) for code in HICP_GEOS],
            fuel_products=[s.NamedCode(code=code, name=name) for code, name in PRODUCT_NAMES.items()],
            inflation_categories=[
                s.NamedCode(code=code, name=self.categories[("ECOICOP_2018", code)])
                for code in HICP_CATEGORIES
            ],
            inflation_measurements=[
                s.NamedCode(code=code, name=name) for code, name in MEASUREMENT_NAMES.items()
            ],
            quote_currencies=[
                s.NamedCode(code=row.code, name=row.name)
                for row in self.repo.session.scalars(
                    select(m.Currency)
                    .where(m.Currency.code.in_(DEFAULT_CURRENCIES))
                    .order_by(m.Currency.code)
                )
            ],
            coverage=coverage,
        )

    def evidence(self, domain, observation_id, limit):
        found = self.repo.evidence(domain, observation_id, limit)
        if found is None:
            return None
        row, artifact, run, revisions, more = found
        fields = {"fuel": FUEL_FIELDS, "inflation": HICP_FIELDS, "exchange-rates": ECB_FIELDS}[domain]
        original = {field: getattr(row, field) for field in fields}
        if domain == "fuel":
            original["raw_unit"] = row.raw_unit_code
        if domain == "inflation":
            original.update(measurement_type=row.measurement_type, index_base_year=row.index_base_year)
        if domain == "exchange-rates":
            original.update(
                base_currency=row.base_currency_code,
                quote_currency=row.quote_currency_code,
                quote_convention=row.quote_convention,
            )
        # Publication date has its own typed field, not a numerical source-value map.
        original.pop("publication_date", None)
        series = self.repo.session.get(m.SourceSeries, row.series_id)
        artifact_ids = {
            value
            for revision in revisions
            for value in (revision.previous_artifact_id, revision.replacement_artifact_id)
        } - {artifact.id}
        revision_artifacts = (
            list(
                self.repo.session.scalars(
                    select(m.SourceArtifact)
                    .where(m.SourceArtifact.id.in_(artifact_ids))
                    .order_by(m.SourceArtifact.id)
                )
            )
            if artifact_ids
            else []
        )
        return s.Evidence(
            domain=domain,
            observation_id=row.id,
            series_id=row.series_id,
            period=self.period(domain, row),
            source=self.attribution(domain),
            source_series_key=series.external_key,
            unit_code=series.unit_code,
            geography_code=series.geography_code,
            category_code=series.category_code,
            tax_basis=series.tax_basis,
            ingestion_run_id=run.id,
            imported_at=run.completed_at,
            observation_publication_date=getattr(row, "publication_date", None),
            original_values=original,
            artifact=artifact_evidence(artifact),
            revision_artifacts=[artifact_evidence(item) for item in revision_artifacts],
            revisions=[
                s.RevisionEvidence(
                    detected_at=revision.detected_at,
                    previous_run_id=revision.previous_run_id,
                    replacement_run_id=revision.replacement_run_id,
                    previous_artifact_id=revision.previous_artifact_id,
                    replacement_artifact_id=revision.replacement_artifact_id,
                    previous={
                        field: getattr(revision, "previous_" + suffix) for field, suffix in fields.items()
                    },
                    replacement={
                        field: getattr(revision, "revised_" + suffix) for field, suffix in fields.items()
                    },
                )
                for revision in revisions
            ],
            revisions_has_more=more,
        )
