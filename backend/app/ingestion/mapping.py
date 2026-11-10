"""Explicit adapter-to-catalogue, fact and revision mappings."""

from app.data_sources import contracts as c
from app.models import price_cost as m

# Current field -> revision suffix. Every mutable published attribute is compared.
FUEL_FIELDS = {
    "raw_value": "raw_value",
    "normalized_price_eur_per_litre": "price_eur_per_litre",
    "status": "status",
    "publication_date": "publication_date",
}
HICP_FIELDS = {"value": "value", "status": "status"}
ECB_FIELDS = {
    "reference_rate": "rate",
    "status": "status",
    "confidentiality": "confidentiality",
    "source_precision": "precision",
}


def map_record(record):
    if isinstance(record, c.FuelPriceObservation):
        category = record.product.value.upper()
        series = dict(
            external_key=f"{record.country_code}.{category}.{record.tax_basis.value}",
            series_kind="fuel_price",
            indicator_code="FUEL_PRICE",
            geography_code=record.country_code,
            classification_scheme_code="FUEL_PRODUCT",
            category_code=category,
            unit_code="EUR_PER_LITRE",
            frequency="weekly",
            measurement_type="price",
            tax_basis=record.tax_basis.value,
            currency_code="EUR",
        )
        values = dict(
            raw_value=record.raw_value,
            raw_unit_code="EUR_PER_1000_LITRES",
            normalized_price_eur_per_litre=record.price_eur_per_litre,
            publication_date=record.publication_date,
            status=None,
        )
        return (
            series,
            m.FuelPriceObservation,
            m.FuelPriceRevision,
            "reference_week",
            record.reference_week,
            values,
            FUEL_FIELDS,
        )
    if isinstance(record, c.HicpObservation):
        measure = {"I25": "index", "RCH_M": "monthly_rate", "RCH_A": "annual_rate"}[record.unit_code]
        series = dict(
            external_key=f"M.{record.unit_code}.{record.category_code}.{record.geography_code}",
            series_kind="hicp",
            indicator_code=record.unit_code,
            geography_code=record.geography_code,
            classification_scheme_code="ECOICOP_2018",
            category_code=record.category_code,
            unit_code="INDEX_2025_100" if measure == "index" else "PERCENT",
            frequency="monthly",
            measurement_type=measure,
        )
        values = dict(
            measurement_type=measure,
            index_base_year=2025 if measure == "index" else None,
            value=record.value,
            status=record.status,
        )
        return (
            series,
            m.HicpObservation,
            m.HicpObservationRevision,
            "reference_month",
            record.period,
            values,
            HICP_FIELDS,
        )
    if isinstance(record, c.ExchangeRateObservation):
        series = dict(
            external_key=record.series_key.removeprefix("EXR."),
            series_kind="exchange_rate",
            indicator_code="EXR_SP00",
            unit_code="FOREIGN_CURRENCY_PER_EUR",
            frequency="daily",
            measurement_type="reference_rate",
            base_currency_code="EUR",
            quote_currency_code=record.quote_currency,
        )
        values = dict(
            base_currency_code="EUR",
            quote_currency_code=record.quote_currency,
            reference_rate=record.foreign_currency_units_per_eur,
            quote_convention="FOREIGN_CURRENCY_PER_EUR",
            source_precision=record.source_decimals,
            status=record.status,
            confidentiality=record.confidentiality,
        )
        return (
            series,
            m.ExchangeRateObservation,
            m.ExchangeRateRevision,
            "reference_date",
            record.observation_date,
            values,
            ECB_FIELDS,
        )
    raise TypeError("Unsupported source record")
