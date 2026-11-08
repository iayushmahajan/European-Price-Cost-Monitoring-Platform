"""Strict CSV parser for ECB daily euro foreign-exchange reference rates."""

import csv
import io
import urllib.parse
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.data_sources._download import download_bytes
from app.data_sources.contracts import ExchangeRateBatch, ExchangeRateObservation
from app.data_sources.errors import SourceContractError

ECB_EXR_API_URL = "https://data-api.ecb.europa.eu/service/data/EXR"
DEFAULT_CURRENCIES = ("CZK", "DKK", "HUF", "PLN", "RON", "SEK", "GBP", "CHF", "USD")
REQUIRED_COLUMNS = {
    "KEY", "FREQ", "CURRENCY", "CURRENCY_DENOM", "EXR_TYPE", "EXR_SUFFIX",
    "TIME_PERIOD", "OBS_VALUE", "OBS_STATUS", "OBS_CONF", "DECIMALS", "UNIT",
}


class EcbExchangeRateAdapter:
    """Fetch and parse configured daily ECB reference-rate series."""

    def __init__(
        self,
        *,
        currencies: tuple[str, ...] = DEFAULT_CURRENCIES,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> None:
        if not currencies or len(set(currencies)) != len(currencies):
            raise SourceContractError("ECB currencies must be non-empty and unique")
        if any(len(code) != 3 or not code.isalpha() or not code.isupper() for code in currencies):
            raise SourceContractError("ECB currencies must be uppercase ISO-style codes")
        if "EUR" in currencies:
            raise SourceContractError("EUR cannot be its own quote currency")
        if start_date and end_date and start_date > end_date:
            raise SourceContractError("ECB start date cannot follow the end date")
        self.currencies = currencies
        self.start_date = start_date
        self.end_date = end_date

    @property
    def source_url(self) -> str:
        currencies = urllib.parse.quote("+".join(self.currencies), safe="+")
        parameters = [("format", "csvdata")]
        if self.start_date:
            parameters.append(("startPeriod", self.start_date.isoformat()))
        if self.end_date:
            parameters.append(("endPeriod", self.end_date.isoformat()))
        query = urllib.parse.urlencode(parameters)
        return f"{ECB_EXR_API_URL}/D.{currencies}.EUR.SP00.A?{query}"

    def fetch(self) -> bytes:
        return download_bytes(self.source_url, max_bytes=20_000_000, timeout=90)

    def parse(self, payload: bytes) -> ExchangeRateBatch:
        try:
            text = payload.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise SourceContractError("ECB response is not UTF-8 CSV") from exc
        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None or len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise SourceContractError("ECB CSV header is missing or contains duplicate columns")
        if not REQUIRED_COLUMNS <= set(reader.fieldnames):
            raise SourceContractError("ECB CSV contract is missing required columns")

        records: list[ExchangeRateObservation] = []
        seen: set[tuple[str, date]] = set()
        seen_currencies: set[str] = set()
        for row in reader:
            currency = row["CURRENCY"]
            if currency not in self.currencies:
                raise SourceContractError("ECB response contains an unrequested currency")
            expected_key = f"EXR.D.{currency}.EUR.SP00.A"
            if row["KEY"] != expected_key:
                raise SourceContractError("ECB series key does not match its dimensions")
            if row["FREQ"] != "D" or row["CURRENCY_DENOM"] != "EUR":
                raise SourceContractError("ECB response changed frequency or quote denominator")
            if row["EXR_TYPE"] != "SP00" or row["EXR_SUFFIX"] != "A":
                raise SourceContractError("ECB response is not a daily spot reference-rate series")
            if row["UNIT"] != currency:
                raise SourceContractError("ECB observation unit does not match its quote currency")
            try:
                observation_date = datetime.strptime(row["TIME_PERIOD"], "%Y-%m-%d").date()
            except ValueError as exc:
                raise SourceContractError("ECB observation date is invalid") from exc
            if observation_date.weekday() >= 5:
                raise SourceContractError("ECB reference-rate response unexpectedly contains a weekend")
            if self.start_date and observation_date < self.start_date:
                raise SourceContractError("ECB response contains a date before the requested range")
            if self.end_date and observation_date > self.end_date:
                raise SourceContractError("ECB response contains a date after the requested range")
            try:
                value = Decimal(row["OBS_VALUE"])
                decimals = int(row["DECIMALS"])
            except (InvalidOperation, TypeError, ValueError) as exc:
                raise SourceContractError("ECB observation value or precision is invalid") from exc
            if not value.is_finite() or value <= 0:
                raise SourceContractError("ECB reference rate must be finite and positive")
            key = (currency, observation_date)
            if key in seen:
                raise SourceContractError("ECB response contains duplicate observations")
            seen.add(key)
            seen_currencies.add(currency)
            records.append(ExchangeRateObservation(
                series_key=row["KEY"],
                observation_date=observation_date,
                quote_currency=currency,
                foreign_currency_units_per_eur=value,
                status=row["OBS_STATUS"] or None,
                confidentiality=row["OBS_CONF"] or None,
                source_decimals=decimals,
            ))
        if seen_currencies != set(self.currencies):
            raise SourceContractError("ECB response omits one or more configured currency series")
        if not records:
            raise SourceContractError("ECB response contains no usable observations")
        dates = [record.observation_date for record in records]
        return ExchangeRateBatch(
            source_url=self.source_url,
            currencies=self.currencies,
            records=tuple(records),
            earliest_date=min(dates),
            latest_date=max(dates),
        )
