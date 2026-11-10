"""Closed query contracts: supported selections, explicit periods and workload bounds."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.api.schemas.price_cost import Measurement
from app.data_sources.contracts import FuelProduct, TaxBasis
from app.data_sources.ecb import DEFAULT_CURRENCIES
from app.data_sources.hicp import HICP_CATEGORIES, HICP_GEOS
from app.data_sources.oil_bulletin import EU_COUNTRIES
from app.ingestion.freshness import source_today

CountryText = Annotated[str, Field(min_length=2, max_length=250)]
SelectionText = Annotated[str, Field(min_length=3, max_length=80)]


def selection(value, allowed, maximum):
    parts = value.split(",")
    if len(parts) > maximum or len(set(parts)) != len(parts) or not set(parts) <= set(allowed):
        raise ValueError(
            "Selection must contain unique, approved, comma-separated codes within the selection limit"
        )
    return value


class ClosedQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AsOfQuery(ClosedQuery):
    as_of: date | None = None

    @field_validator("as_of")
    @classmethod
    def validate_as_of(cls, value):
        if value and value > source_today():
            raise ValueError("as_of cannot be in the future")
        return value


class FuelLatestQuery(AsOfQuery):
    countries: CountryText = ",".join(EU_COUNTRIES.values())
    product: FuelProduct | None = None
    tax_basis: TaxBasis = TaxBasis.WITH_TAX

    @field_validator("countries")
    @classmethod
    def validate_countries(cls, value):
        return selection(value, EU_COUNTRIES.values(), 27)


class InflationLatestQuery(AsOfQuery):
    countries: CountryText = "EU27_2020,DE"
    category: str = Field(default="TOTAL", min_length=2, max_length=12)
    measurement: Measurement = "annual_rate"

    @field_validator("countries")
    @classmethod
    def validate_countries(cls, value):
        return selection(value, HICP_GEOS, 28)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value):
        if value not in HICP_CATEGORIES:
            raise ValueError("Unsupported HICP category")
        return value


class ExchangeLatestQuery(AsOfQuery):
    currencies: SelectionText = ",".join(DEFAULT_CURRENCIES)
    inverse: bool = False
    comparison_date: date | None = None

    @field_validator("currencies")
    @classmethod
    def validate_currencies(cls, value):
        return selection(value, DEFAULT_CURRENCIES, 9)

    @model_validator(mode="after")
    def validate_comparison(self):
        if self.comparison_date:
            end = self.as_of or source_today()
            if not 0 < (end - self.comparison_date).days <= 3660:
                raise ValueError("comparison_date must precede as_of by at most 3660 days")
        return self


class HistoryQuery(ClosedQuery):
    order: Literal["asc", "desc"] = "asc"
    start: date
    end: date
    limit: int = Field(default=260, ge=1, le=2000)

    @model_validator(mode="after")
    def validate_range(self):
        if self.start > self.end or self.end > source_today() or (self.end - self.start).days > 3660:
            raise ValueError("History requires start <= end <= today and a window of at most 3660 days")
        return self


class FuelHistoryQuery(HistoryQuery):
    country: str = Field(min_length=2, max_length=12)
    product: FuelProduct = FuelProduct.EURO_SUPER_95
    tax_basis: TaxBasis = TaxBasis.WITH_TAX

    @field_validator("country")
    @classmethod
    def validate_country(cls, value):
        return selection(value, EU_COUNTRIES.values(), 1)


class InflationHistoryQuery(HistoryQuery):
    country: str = Field(min_length=2, max_length=12)
    category: str = Field(default="TOTAL", min_length=2, max_length=12)
    measurement: Measurement = "annual_rate"

    @field_validator("country")
    @classmethod
    def validate_country(cls, value):
        return selection(value, HICP_GEOS, 1)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value):
        return InflationLatestQuery.validate_category(value)

    @model_validator(mode="after")
    def validate_months(self):
        if self.start.day != 1 or self.end.day != 1:
            raise ValueError("HICP history boundaries represent months and must be first-of-month dates")
        return self


class ExchangeHistoryQuery(HistoryQuery):
    currency: str = Field(min_length=3, max_length=3)
    inverse: bool = False

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value):
        return selection(value, DEFAULT_CURRENCIES, 1)


class FuelCompareQuery(AsOfQuery):
    countries: CountryText
    base_country: str = Field(min_length=2, max_length=12)
    product: FuelProduct = FuelProduct.EURO_SUPER_95
    tax_basis: TaxBasis = TaxBasis.WITH_TAX
    period: date | None = None

    @model_validator(mode="after")
    def validate_selection(self):
        selection(self.countries, EU_COUNTRIES.values(), 8)
        if len(self.countries.split(",")) < 2 or self.base_country not in self.countries.split(","):
            raise ValueError("Select 2–8 countries including base_country")
        if self.period and (self.period > (self.as_of or source_today())):
            raise ValueError("period cannot follow as_of")
        return self


class InflationCompareQuery(AsOfQuery):
    countries: CountryText
    base_country: str = Field(min_length=2, max_length=12)
    category: str = Field(default="TOTAL", min_length=2, max_length=12)
    measurement: Measurement = "annual_rate"
    period: date | None = None

    @model_validator(mode="after")
    def validate_selection(self):
        selection(self.countries, HICP_GEOS, 8)
        InflationLatestQuery.validate_category(self.category)
        if len(self.countries.split(",")) < 2 or self.base_country not in self.countries.split(","):
            raise ValueError("Select 2–8 countries including base_country")
        if self.measurement == "index":
            raise ValueError("HICP index levels cannot be used for cross-country cost comparisons")
        if self.period and (self.period.day != 1 or self.period > (self.as_of or source_today())):
            raise ValueError("period must represent a month, on/before as_of")
        return self


class OverviewQuery(AsOfQuery):
    country: str = Field(default="DE", min_length=2, max_length=12)
    currency: str = Field(default="GBP", min_length=3, max_length=3)

    @field_validator("country")
    @classmethod
    def validate_country(cls, value):
        return selection(value, EU_COUNTRIES.values(), 1)

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value):
        return selection(value, DEFAULT_CURRENCIES, 1)


class FuelHistoryCompareQuery(FuelCompareQuery):
    @model_validator(mode="after")
    def validate_pair(self):
        if len(self.countries.split(",")) != 2:
            raise ValueError("Historical comparison requires exactly two countries")
        return self
