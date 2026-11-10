"""Strict, source-specific parsing contracts for approved European data sources."""

from app.data_sources.contracts import (
    ExchangeRateBatch,
    ExchangeRateObservation,
    FuelPriceBatch,
    FuelPriceObservation,
    FuelProduct,
    HicpBatch,
    HicpMeasure,
    HicpObservation,
    TaxBasis,
)
from app.data_sources.ecb import EcbExchangeRateAdapter
from app.data_sources.errors import SourceContractError
from app.data_sources.hicp import EurostatHicpAdapter
from app.data_sources.oil_bulletin import WeeklyOilBulletinAdapter

__all__ = [
    "EcbExchangeRateAdapter",
    "EurostatHicpAdapter",
    "ExchangeRateBatch",
    "ExchangeRateObservation",
    "FuelPriceBatch",
    "FuelPriceObservation",
    "FuelProduct",
    "HicpBatch",
    "HicpMeasure",
    "HicpObservation",
    "SourceContractError",
    "TaxBasis",
    "WeeklyOilBulletinAdapter",
]
