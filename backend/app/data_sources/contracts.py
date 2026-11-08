"""Typed records that preserve the semantics of each approved source."""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FrozenRecord(BaseModel):
    model_config = ConfigDict(frozen=True)


class FuelProduct(str, Enum):
    EURO_SUPER_95 = "euro_super_95"
    AUTOMOTIVE_DIESEL = "automotive_diesel"


class TaxBasis(str, Enum):
    WITH_TAX = "with_tax"
    WITHOUT_TAX = "without_tax"


class FuelPriceObservation(FrozenRecord):
    source: Literal["ec_weekly_oil_bulletin"] = "ec_weekly_oil_bulletin"
    country_code: str = Field(pattern=r"^[A-Z]{2}$")
    country_name: str = Field(min_length=1)
    reference_week: date
    publication_date: date | None = None
    product: FuelProduct
    tax_basis: TaxBasis
    raw_value: Decimal = Field(gt=0)
    raw_unit: Literal["EUR/1000 litres"] = "EUR/1000 litres"
    price_eur_per_litre: Decimal = Field(gt=0)
    normalized_unit: Literal["EUR/litre"] = "EUR/litre"

    @model_validator(mode="after")
    def validate_normalization(self) -> "FuelPriceObservation":
        if self.price_eur_per_litre != self.raw_value / Decimal(1000):
            raise ValueError("Fuel normalization must convert EUR/1000 litres to EUR/litre")
        if self.publication_date and self.publication_date < self.reference_week:
            raise ValueError("Publication date cannot precede the reference week")
        return self


class FuelPriceBatch(FrozenRecord):
    source_url: str = Field(min_length=1)
    reference_week: date
    publication_date: date | None = None
    tax_basis: TaxBasis
    records: tuple[FuelPriceObservation, ...]


class HicpMeasure(str, Enum):
    INDEX_2025 = "index_2025_100"
    MONTHLY_RATE = "monthly_rate_percent"
    ANNUAL_RATE = "annual_rate_percent"


class HicpObservation(FrozenRecord):
    source: Literal["eurostat_prc_hicp_minr"] = "eurostat_prc_hicp_minr"
    geography_code: str = Field(min_length=2)
    geography_name: str = Field(min_length=1)
    category_code: str = Field(min_length=2)
    category_name: str = Field(min_length=1)
    period: date
    measure: HicpMeasure
    unit_code: Literal["I25", "RCH_M", "RCH_A"]
    value: Decimal
    status: str | None = None

    @model_validator(mode="after")
    def validate_measure_unit(self) -> "HicpObservation":
        expected = {
            HicpMeasure.INDEX_2025: "I25",
            HicpMeasure.MONTHLY_RATE: "RCH_M",
            HicpMeasure.ANNUAL_RATE: "RCH_A",
        }[self.measure]
        if self.unit_code != expected:
            raise ValueError("HICP measure and source unit code disagree")
        if self.measure == HicpMeasure.INDEX_2025 and self.value <= 0:
            raise ValueError("A HICP index observation must be positive")
        return self


class HicpBatch(FrozenRecord):
    source_url: str = Field(min_length=1)
    source_updated_at: datetime
    records: tuple[HicpObservation, ...]
    missing_observation_count: int = Field(ge=0)


class ExchangeRateObservation(FrozenRecord):
    source: Literal["ecb_exr"] = "ecb_exr"
    series_key: str = Field(min_length=1)
    observation_date: date
    base_currency: Literal["EUR"] = "EUR"
    quote_currency: str = Field(pattern=r"^[A-Z]{3}$")
    foreign_currency_units_per_eur: Decimal = Field(gt=0)
    status: str | None = None
    confidentiality: str | None = None
    source_decimals: int = Field(ge=0, le=12)


class ExchangeRateBatch(FrozenRecord):
    source_url: str = Field(min_length=1)
    currencies: tuple[str, ...]
    records: tuple[ExchangeRateObservation, ...]
    earliest_date: date
    latest_date: date
