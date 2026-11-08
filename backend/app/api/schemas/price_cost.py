"""Version 1 product contracts. Decimal fields serialize as exact JSON strings."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.data_sources.contracts import FuelProduct, TaxBasis

Domain = Literal["fuel", "inflation", "exchange-rates"]
Measurement = Literal["annual_rate", "monthly_rate", "index"]
SourceCode = Literal["ec_weekly_oil_bulletin", "eurostat_prc_hicp_minr", "ecb_exr"]


class NamedCode(BaseModel):
    code: str
    name: str


class Explanation(BaseModel):
    rule_version: Literal["1"] = "1"
    what_changed: str
    what_it_means: str
    why_it_might_matter: str
    limitations: list[str]


class ObservationStatus(BaseModel):
    source_status: str | None = None
    estimated: bool | None = None
    provisional: bool | None = None


class Change(BaseModel):
    available: bool
    basis: Literal["previous_available", "on_or_before_requested_date"] = "previous_available"
    requested_period: date | None = None
    reference_period: date | None = None
    reference_value: Decimal | None = None
    reference_status: ObservationStatus | None = None
    absolute_change: Decimal | None = None
    absolute_change_unit: str
    relative_change_percent: Decimal | None = None
    consecutive: bool | None = None
    elapsed_days: int | None = None
    unavailable_reason: str | None = None


class Attribution(BaseModel):
    code: SourceCode
    name: str
    official_url: str
    methodology: str


class QualitySummary(BaseModel):
    checked_run_id: int | None = None
    missing_cells_in_last_successful_check: int | None = None
    revised_observations_in_last_successful_check: int | None = None
    warning_or_error_codes: list[str] = Field(default_factory=list)
    sparse_absence_policy: str | None = None


class SourceStatus(BaseModel):
    source: Attribution
    available: bool
    expected_frequency: Literal["daily", "weekly", "monthly"]
    latest_observation: date | None = None
    oldest_series_latest: date | None = None
    observation_freshness: Literal["current", "stale", "unavailable"]
    synchronization_status: Literal["never_run", "current", "stale", "failed"]
    running: bool
    last_attempt_at: datetime | None = None
    last_success_at: datetime | None = None
    source_updated_at: datetime | None = None
    latest_artifact_publication_date: date | None = None
    latest_artifact_published_at: datetime | None = None
    freshness_policy: str
    quality: QualitySummary


class MetricBase(BaseModel):
    observation_id: int
    series_id: int
    indicator_id: str
    indicator_name: str
    period: date
    value: Decimal = Field(allow_inf_nan=False)
    status: ObservationStatus
    publication_date: date | None = None
    observation_freshness: Literal["current", "stale"]
    source_code: SourceCode
    comparison: Change
    explanation: Explanation
    evidence_path: str


class FuelMetric(MetricBase):
    value: Decimal = Field(gt=0, allow_inf_nan=False)
    geography: NamedCode
    product: FuelProduct
    tax_basis: TaxBasis
    unit: Literal["EUR/litre"] = "EUR/litre"
    measurement_type: Literal["price"] = "price"
    period_type: Literal["reference_week"] = "reference_week"


class InflationMetric(MetricBase):
    geography: NamedCode
    category: NamedCode
    unit: Literal["percent", "index_points"]
    measurement_type: Measurement
    index_base_year: Literal[2025] | None = None
    period_type: Literal["reference_month"] = "reference_month"

    @model_validator(mode="after")
    def validate_measurement(self):
        if self.period.day != 1:
            raise ValueError("HICP period represents a month")
        if self.measurement_type == "index":
            if self.unit != "index_points" or self.index_base_year != 2025 or self.value <= 0:
                raise ValueError("HICP index requires positive index points with base year 2025")
        elif self.unit != "percent" or self.index_base_year is not None:
            raise ValueError("HICP rates require percent and no index base year")
        return self


class ExchangeMetric(MetricBase):
    value: Decimal = Field(gt=0, allow_inf_nan=False)
    base_currency: Literal["EUR"] = "EUR"
    quote_currency: str
    unit: str
    measurement_type: Literal["reference_rate"] = "reference_rate"
    period_type: Literal["reference_date"] = "reference_date"
    quote_convention: Literal["1 EUR = value quote-currency units"] = "1 EUR = value quote-currency units"
    source_precision: int
    inverse_rate: Decimal | None = None
    inverse_unit: str | None = None
    inverse_is_derived: bool | None = None

    @model_validator(mode="after")
    def validate_quote(self):
        if self.unit != f"{self.quote_currency}/EUR":
            raise ValueError("ECB rate must retain the official EUR base quote direction")
        if self.inverse_rate is not None:
            if (
                self.inverse_rate <= 0
                or self.inverse_unit != f"EUR/{self.quote_currency}"
                or self.inverse_is_derived is not True
            ):
                raise ValueError(
                    "Inverse rate must be positive and explicitly identified as derived EUR/quote"
                )
        elif self.inverse_unit is not None or self.inverse_is_derived is not None:
            raise ValueError("Inverse metadata requires a derived rate")
        return self


class PageInfo(BaseModel):
    has_more: bool = False
    next_start: date | None = None
    limit: int | None = None


class MetricResponse(BaseModel):
    available: bool
    missing_selections: list[str]
    sources: list[SourceStatus]
    page: PageInfo = Field(default_factory=PageInfo)


class FuelResponse(MetricResponse):
    items: list[FuelMetric]


class InflationResponse(MetricResponse):
    items: list[InflationMetric]


class ExchangeResponse(MetricResponse):
    items: list[ExchangeMetric]


class CountryDifference(BaseModel):
    geography: NamedCode
    value: Decimal
    difference_from_base: Decimal
    difference_unit: str
    relative_difference_percent: Decimal | None = None
    observation_id: int
    status: ObservationStatus


class CountryComparison(BaseModel):
    available: bool
    period: date | None
    base_geography: str
    category_or_product: str
    measurement_type: str
    tax_basis: TaxBasis | None = None
    unit: str
    missing_selections: list[str]
    items: list[CountryDifference]
    sources: list[SourceStatus]
    explanation: Explanation


class Coverage(BaseModel):
    series_id: int
    source_code: SourceCode
    geography_code: str | None
    category_code: str | None
    measurement_type: str
    tax_basis: str | None
    quote_currency: str | None
    unit_code: str
    first_period: date | None
    latest_period: date | None


class Catalogue(BaseModel):
    geographies: list[NamedCode]
    fuel_products: list[NamedCode]
    inflation_categories: list[NamedCode]
    inflation_measurements: list[NamedCode]
    quote_currencies: list[NamedCode]
    coverage: list[Coverage]


class EvidenceArtifact(BaseModel):
    id: int
    url: str
    sha256: str
    retrieved_at: datetime
    publication_date: date | None
    published_at: datetime | None
    source_updated_at: datetime | None


class RevisionEvidence(BaseModel):
    detected_at: datetime
    previous_run_id: int
    replacement_run_id: int
    previous_artifact_id: int
    replacement_artifact_id: int
    previous: dict[str, Decimal | str | int | date | None]
    replacement: dict[str, Decimal | str | int | date | None]


class Evidence(BaseModel):
    domain: Domain
    observation_id: int
    series_id: int
    period: date
    source: Attribution
    source_series_key: str
    unit_code: str
    geography_code: str | None
    category_code: str | None
    tax_basis: str | None
    ingestion_run_id: int
    imported_at: datetime | None
    observation_publication_date: date | None
    original_values: dict[str, Decimal | str | int | None]
    artifact: EvidenceArtifact
    revision_artifacts: list[EvidenceArtifact]
    revisions: list[RevisionEvidence]
    revisions_has_more: bool


class Overview(BaseModel):
    geography: NamedCode
    fuel: FuelResponse
    inflation: InflationResponse
    exchange_rates: ExchangeResponse
