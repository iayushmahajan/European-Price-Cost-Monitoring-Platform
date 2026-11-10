"""Closed intent operations and versioned, restorable analyst results; no SQL fields."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.api.schemas import price_cost as s
from app.api.schemas import price_cost_queries as q
from app.api.schemas.query import AppError, ClarificationTurn, Contract, Timings
from app.core.config import settings
from app.data_sources.contracts import FuelProduct
from app.data_sources.oil_bulletin import EU_COUNTRIES


class AnalysisRequest(Contract):
    question: str = Field(min_length=1, max_length=2000)
    clarification: list[ClarificationTurn] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def bounded_context(self):
        if len(self.model_dump_json().encode("utf-8")) > min(16000, settings.MAX_RESULT_BYTES // 4):
            raise ValueError("Question and clarification context exceeds the configured byte limit")
        return self


# AI selections must be explicit. Product defaults (TOTAL, annual rate, tax-inclusive,
# EUR base) are server-disclosed; geography/currency/product scope is never defaulted.
class FuelLatest(q.FuelLatestQuery):
    countries: q.CountryText
    product: FuelProduct | None


class InflationLatest(q.InflationLatestQuery):
    countries: q.CountryText


class ExchangeLatest(q.ExchangeLatestQuery):
    currencies: q.SelectionText


class FuelHistory(q.FuelHistoryQuery):
    order: Literal["asc"] = "asc"
    product: FuelProduct
    limit: int = Field(default=100, ge=1, le=100)


class InflationHistory(q.InflationHistoryQuery):
    order: Literal["asc"] = "asc"
    limit: int = Field(default=100, ge=1, le=100)


class ExchangeHistory(q.ExchangeHistoryQuery):
    order: Literal["asc"] = "asc"
    limit: int = Field(default=100, ge=1, le=100)


class FuelTaxQuery(q.AsOfQuery):
    country: str = Field(min_length=2, max_length=12)
    product: FuelProduct
    period: date | None = None

    @model_validator(mode="after")
    def valid_country(self):
        q.selection(self.country, EU_COUNTRIES.values(), 1)
        if self.period and self.period > (self.as_of or q.source_today()):
            raise ValueError("period cannot follow as_of")
        return self


class FuelLatestOperation(Contract):
    kind: Literal["fuel_latest"]
    query: FuelLatest


class FuelHistoryOperation(Contract):
    kind: Literal["fuel_history"]
    query: FuelHistory


class FuelCompareOperation(Contract):
    kind: Literal["fuel_compare"]
    query: q.FuelCompareQuery


class FuelTaxOperation(Contract):
    kind: Literal["fuel_tax_comparison"]
    query: FuelTaxQuery


class InflationLatestOperation(Contract):
    kind: Literal["inflation_latest"]
    query: InflationLatest


class InflationHistoryOperation(Contract):
    kind: Literal["inflation_history"]
    query: InflationHistory


class InflationCompareOperation(Contract):
    kind: Literal["inflation_compare"]
    query: q.InflationCompareQuery


class ExchangeLatestOperation(Contract):
    kind: Literal["exchange_latest"]
    query: ExchangeLatest


class ExchangeHistoryOperation(Contract):
    kind: Literal["exchange_history"]
    query: ExchangeHistory


class CurrenciesOperation(Contract):
    kind: Literal["supported_currencies"]


Operation = Annotated[
    FuelLatestOperation
    | FuelHistoryOperation
    | FuelCompareOperation
    | FuelTaxOperation
    | InflationLatestOperation
    | InflationHistoryOperation
    | InflationCompareOperation
    | ExchangeLatestOperation
    | ExchangeHistoryOperation
    | CurrenciesOperation,
    Field(discriminator="kind"),
]

ClarificationCode = Literal[
    "geography", "product", "countries", "currency", "dates", "measurement", "category", "direction", "scope"
]
UnsupportedCode = Literal[
    "forecast",
    "company_cost",
    "causation",
    "cross_domain",
    "unsupported_currency",
    "unsupported_category",
    "index_country_comparison",
    "unsupported_geography",
    "cross_rate",
    "unsupported_operation",
    "unsafe_request",
]


class ReadyPlan(Contract):
    status: Literal["ready"]
    operation: Operation


class ClarificationPlan(Contract):
    status: Literal["needs_clarification"]
    reason: ClarificationCode


class BlockedPlan(Contract):
    status: Literal["blocked"]
    reason: UnsupportedCode


Plan = Annotated[ReadyPlan | ClarificationPlan | BlockedPlan, Field(discriminator="status")]


class PlannerOutput(Contract):
    plan: Plan


class FuelResult(Contract):
    kind: Literal["fuel"] = "fuel"
    data: s.FuelResponse


class InflationResult(Contract):
    kind: Literal["inflation"] = "inflation"
    data: s.InflationResponse


class ExchangeResult(Contract):
    kind: Literal["exchange-rates"] = "exchange-rates"
    data: s.ExchangeResponse


class CountryResult(Contract):
    kind: Literal["country_comparison"] = "country_comparison"
    domain: Literal["fuel", "inflation"]
    data: s.CountryComparison


class TaxResult(Contract):
    kind: Literal["fuel_tax_comparison"] = "fuel_tax_comparison"
    available: bool
    items: list[s.FuelMetric]
    difference_eur_per_litre: Decimal | None
    relative_difference_percent: Decimal | None
    sources: list[s.SourceStatus]


class CurrenciesResult(Contract):
    kind: Literal["supported_currencies"] = "supported_currencies"
    items: list[s.NamedCode]
    sources: list[s.SourceStatus]


VerifiedResult = Annotated[
    FuelResult | InflationResult | ExchangeResult | CountryResult | TaxResult | CurrenciesResult,
    Field(discriminator="kind"),
]


class SummaryComparison(Contract):
    comparison: s.Change
    explanation: s.Explanation
    scope: Literal["returned_window", "latest_comparison"]
    direction: Literal["official", "inverse"] = "official"


class TableColumn(Contract):
    key: str
    label: str
    value_type: Literal["date", "decimal", "text", "boolean"]


class VerifiedTable(Contract):
    columns: list[TableColumn] = Field(default_factory=list, max_length=20)
    rows: list[dict[str, str | bool | None]] = Field(default_factory=list, max_length=100)


class ObservationEvidence(Contract):
    observation_id: int
    series_id: int
    source_code: s.SourceCode
    period: date
    value: Decimal
    unit: str
    source_attributes: dict[str, str | int | None] = Field(default_factory=dict)
    status: str | None
    raw_value: Decimal | None = None
    raw_unit: str | None = None
    ingestion_run_id: int
    imported_at: datetime | None
    artifact_id: int
    sha256: str
    source_url: str
    retrieved_at: datetime
    observation_publication_date: date | None
    artifact_publication_date: date | None
    source_updated_at: datetime | None
    evidence_path: str


class AnalysisResponse(Contract):
    id: int | None = None
    dataset: Literal["price_cost"] = "price_cost"
    domain: s.Domain | None = None
    schema_version: Literal[1] = 1
    request_id: str
    question: str
    clarification: list[ClarificationTurn] = Field(default_factory=list, max_length=3)
    status: Literal["success", "unavailable", "needs_clarification", "blocked", "failed"]
    plan: Plan | None = None
    answer: str = Field(default="", max_length=2000)
    findings: list[str] = Field(default_factory=list, max_length=3)
    follow_up_questions: list[str] = Field(default_factory=list, max_length=3)
    clarification_question: str | None = None
    assumptions: list[str] = Field(default_factory=list, max_length=10)
    warnings: list[str] = Field(default_factory=list, max_length=12)
    explanation: s.Explanation | None = None
    verified_data: VerifiedResult | None = None
    table: VerifiedTable = Field(default_factory=VerifiedTable)
    summary_comparison: SummaryComparison | None = None
    evidence: list[ObservationEvidence] = Field(default_factory=list, max_length=200)
    row_count: int = 0
    possibly_truncated: bool = False
    timings: Timings = Field(default_factory=Timings)
    error: AppError | None = None
    created_at: datetime
    assessment_date: date


class AnalysisHistoryItem(Contract):
    id: int
    dataset: Literal["price_cost"] = "price_cost"
    domain: s.Domain | None = None
    schema_version: int | None
    question: str
    status: str
    operation: str | None
    row_count: int | None
    created_at: datetime
