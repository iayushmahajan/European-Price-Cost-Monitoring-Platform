"""Strict JSON-stat parser for Eurostat's current HICP monthly dataset."""

import itertools
import json
import math
import urllib.parse
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.data_sources._download import download_bytes
from app.data_sources.contracts import HicpBatch, HicpMeasure, HicpObservation
from app.data_sources.errors import SourceContractError

HICP_DATASET_CODE = "prc_hicp_minr"
HICP_API_URL = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
    f"{HICP_DATASET_CODE}"
)
HICP_DIMENSIONS = ("freq", "unit", "coicop18", "geo", "time")
HICP_UNITS = ("I25", "RCH_M", "RCH_A")
HICP_MEASURES = {
    "I25": HicpMeasure.INDEX_2025,
    "RCH_M": HicpMeasure.MONTHLY_RATE,
    "RCH_A": HicpMeasure.ANNUAL_RATE,
}
HICP_CATEGORIES = (
    "TOTAL", "CP01", "CP03", "CP04", "CP06", "CP07", "CP11",
)
HICP_GEOS = (
    "EU27_2020", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI",
    "FR", "DE", "EL", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
)


def _dimension_codes(document: dict, dimension: str) -> tuple[str, ...]:
    try:
        index = document["dimension"][dimension]["category"]["index"]
    except (KeyError, TypeError) as exc:
        raise SourceContractError(f"HICP response is missing dimension {dimension}") from exc
    if isinstance(index, list):
        codes = tuple(index)
    elif isinstance(index, dict):
        if set(index.values()) != set(range(len(index))):
            raise SourceContractError(f"HICP {dimension} positions are not contiguous and unique")
        codes = tuple(code for code, _ in sorted(index.items(), key=lambda item: item[1]))
    else:
        raise SourceContractError(f"HICP {dimension} index has an unsupported shape")
    if not codes or not all(isinstance(code, str) and code for code in codes):
        raise SourceContractError(f"HICP {dimension} contains invalid identifiers")
    return codes


def _labels(document: dict, dimension: str, codes: tuple[str, ...]) -> dict[str, str]:
    try:
        labels = document["dimension"][dimension]["category"]["label"]
    except (KeyError, TypeError) as exc:
        raise SourceContractError(f"HICP response is missing {dimension} labels") from exc
    if not isinstance(labels, dict) or any(not isinstance(labels.get(code), str) for code in codes):
        raise SourceContractError(f"HICP {dimension} labels are incomplete")
    return labels


def _sparse(source: object, cells: int, field: str) -> dict[int, object]:
    if isinstance(source, list):
        if len(source) != cells:
            raise SourceContractError(f"HICP {field} array size is inconsistent")
        return {position: value for position, value in enumerate(source) if value is not None}
    if isinstance(source, dict):
        try:
            result = {int(position): value for position, value in source.items() if value is not None}
        except (TypeError, ValueError) as exc:
            raise SourceContractError(f"HICP {field} positions are invalid") from exc
        if any(position < 0 or position >= cells for position in result):
            raise SourceContractError(f"HICP {field} position is outside declared dimensions")
        return result
    raise SourceContractError(f"HICP {field} is missing or unsupported")


def _decimal(value: object) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (Decimal, int, float)):
        raise SourceContractError("HICP observation value is not numeric")
    try:
        result = Decimal(str(value))
    except InvalidOperation as exc:
        raise SourceContractError("HICP observation value is not a valid decimal") from exc
    if not result.is_finite():
        raise SourceContractError("HICP observation value must be finite")
    return result


class EurostatHicpAdapter:
    """Fetch a configured HICP slice and validate its complete JSON-stat contract."""

    def __init__(
        self,
        *,
        geographies: tuple[str, ...] = HICP_GEOS,
        categories: tuple[str, ...] = HICP_CATEGORIES,
        units: tuple[str, ...] = HICP_UNITS,
        since_period: str = "1996-01",
    ) -> None:
        if not geographies or len(set(geographies)) != len(geographies):
            raise SourceContractError("HICP geographies must be non-empty and unique")
        if not categories or len(set(categories)) != len(categories):
            raise SourceContractError("HICP categories must be non-empty and unique")
        if not units or len(set(units)) != len(units):
            raise SourceContractError("HICP units must be non-empty and unique")
        if not set(geographies) <= set(HICP_GEOS):
            raise SourceContractError("HICP geography selection contains an unsupported identifier")
        if not set(categories) <= set(HICP_CATEGORIES):
            raise SourceContractError("HICP category selection contains an unsupported identifier")
        if not set(units) <= set(HICP_UNITS):
            raise SourceContractError("HICP unit selection contains an unsupported identifier")
        try:
            datetime.strptime(since_period, "%Y-%m")
        except ValueError as exc:
            raise SourceContractError("HICP since_period must use YYYY-MM") from exc
        self.geographies = geographies
        self.categories = categories
        self.units = units
        self.since_period = since_period

    @property
    def source_url(self) -> str:
        filters = [
            ("lang", "en"),
            ("freq", "M"),
            *(("unit", unit) for unit in self.units),
            *(("coicop18", category) for category in self.categories),
            *(("geo", geography) for geography in self.geographies),
            ("sinceTimePeriod", self.since_period),
        ]
        return f"{HICP_API_URL}?{urllib.parse.urlencode(filters)}"

    def fetch(self) -> bytes:
        return download_bytes(self.source_url, max_bytes=25_000_000, timeout=90)

    def parse(self, payload: bytes) -> HicpBatch:
        try:
            document = json.loads(payload, parse_float=Decimal)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SourceContractError("HICP response is not valid JSON") from exc
        if document.get("class") != "dataset" or document.get("version") != "2.0":
            raise SourceContractError("HICP response is not JSON-stat 2.0")
        if tuple(document.get("id", ())) != HICP_DIMENSIONS:
            raise SourceContractError("HICP dataset dimensions changed")
        sizes = document.get("size")
        if not isinstance(sizes, list) or len(sizes) != len(HICP_DIMENSIONS):
            raise SourceContractError("HICP dimension sizes are invalid")

        codes = {dimension: _dimension_codes(document, dimension) for dimension in HICP_DIMENSIONS}
        if codes["freq"] != ("M",):
            raise SourceContractError("HICP response is not monthly")
        if set(codes["unit"]) != set(self.units) or len(codes["unit"]) != len(self.units):
            raise SourceContractError("HICP response units differ from the requested contract")
        if set(codes["coicop18"]) != set(self.categories):
            raise SourceContractError("HICP response categories differ from the requested contract")
        if set(codes["geo"]) != set(self.geographies):
            raise SourceContractError("HICP response geographies differ from the requested contract")
        if sizes != [len(codes[dimension]) for dimension in HICP_DIMENSIONS]:
            raise SourceContractError("HICP dimension sizes are inconsistent")

        geo_labels = _labels(document, "geo", codes["geo"])
        category_labels = _labels(document, "coicop18", codes["coicop18"])
        cells = math.prod(sizes)
        values = _sparse(document.get("value"), cells, "values")
        statuses = _sparse(document.get("status", {}), cells, "statuses")
        records: list[HicpObservation] = []
        seen: set[tuple[str, str, str, date]] = set()

        for coordinates in itertools.product(*(range(size) for size in sizes)):
            position = 0
            for coordinate, size in zip(coordinates, sizes, strict=True):
                position = position * size + coordinate
            if position not in values:
                continue
            selected = {
                dimension: codes[dimension][coordinate]
                for dimension, coordinate in zip(HICP_DIMENSIONS, coordinates, strict=True)
            }
            try:
                period = datetime.strptime(selected["time"], "%Y-%m").date().replace(day=1)
            except ValueError as exc:
                raise SourceContractError("HICP observation period is invalid") from exc
            key = (selected["geo"], selected["coicop18"], selected["unit"], period)
            if key in seen:
                raise SourceContractError("HICP response contains duplicate observations")
            seen.add(key)
            status = statuses.get(position)
            if status is not None and not isinstance(status, str):
                raise SourceContractError("HICP observation status is not textual")
            records.append(HicpObservation(
                geography_code=selected["geo"],
                geography_name=geo_labels[selected["geo"]],
                category_code=selected["coicop18"],
                category_name=category_labels[selected["coicop18"]],
                period=period,
                measure=HICP_MEASURES[selected["unit"]],
                unit_code=selected["unit"],
                value=_decimal(values[position]),
                status=status,
            ))
        if not records:
            raise SourceContractError("HICP response contains no usable observations")
        try:
            updated = datetime.fromisoformat(document["updated"].replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError) as exc:
            raise SourceContractError("HICP response update timestamp is invalid") from exc
        return HicpBatch(
            source_url=self.source_url,
            source_updated_at=updated,
            records=tuple(records),
            missing_observation_count=cells - len(values),
        )
