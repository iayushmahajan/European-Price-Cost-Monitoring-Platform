// Generated from FastAPI OpenAPI. Decimal JSON values are strings. Do not edit by hand.
export type AnalysisHistoryItem = {
  "id": number;
  "dataset": "price_cost";
  "domain": ("fuel" | "inflation" | "exchange-rates" | null);
  "schema_version": (number | null);
  "question": string;
  "status": string;
  "operation": (string | null);
  "row_count": (number | null);
  "created_at": string;
};

export type AnalysisResponse = {
  "id": (number | null);
  "dataset": "price_cost";
  "domain": ("fuel" | "inflation" | "exchange-rates" | null);
  "schema_version": 1;
  "request_id": string;
  "question": string;
  "clarification": Array<ClarificationTurn>;
  "status": "success" | "unavailable" | "needs_clarification" | "blocked" | "failed";
  "plan": ((ReadyPlan | ClarificationPlan | BlockedPlan) | null);
  "answer": string;
  "findings": Array<string>;
  "follow_up_questions": Array<string>;
  "clarification_question": (string | null);
  "assumptions": Array<string>;
  "warnings": Array<string>;
  "explanation": (Explanation | null);
  "verified_data": ((FuelResult | InflationResult | ExchangeResult | CountryResult | TaxResult | CurrenciesResult) | null);
  "table": VerifiedTable;
  "summary_comparison": (SummaryComparison | null);
  "evidence": Array<ObservationEvidence>;
  "row_count": number;
  "possibly_truncated": boolean;
  "timings": Timings;
  "error": (AppError | null);
  "created_at": string;
  "assessment_date": string;
};

export type AppError = {
  "code": string;
  "message": string;
};

export type Attribution = {
  "code": "ec_weekly_oil_bulletin" | "eurostat_prc_hicp_minr" | "ecb_exr";
  "name": string;
  "official_url": string;
  "methodology": string;
};

export type BlockedPlan = {
  "status": "blocked";
  "reason": "forecast" | "company_cost" | "causation" | "cross_domain" | "unsupported_currency" | "unsupported_category" | "index_country_comparison" | "unsupported_geography" | "cross_rate" | "unsupported_operation" | "unsafe_request";
};

export type Catalogue = {
  "geographies": Array<NamedCode>;
  "fuel_products": Array<NamedCode>;
  "inflation_categories": Array<NamedCode>;
  "inflation_measurements": Array<NamedCode>;
  "quote_currencies": Array<NamedCode>;
  "coverage": Array<Coverage>;
};

export type Change = {
  "available": boolean;
  "basis": "previous_available" | "on_or_before_requested_date";
  "requested_period": (string | null);
  "reference_period": (string | null);
  "reference_value": (string | null);
  "reference_status": (ObservationStatus | null);
  "absolute_change": (string | null);
  "absolute_change_unit": string;
  "relative_change_percent": (string | null);
  "consecutive": (boolean | null);
  "elapsed_days": (number | null);
  "unavailable_reason": (string | null);
};

export type ClarificationPlan = {
  "status": "needs_clarification";
  "reason": "geography" | "product" | "countries" | "currency" | "dates" | "measurement" | "category" | "direction" | "scope";
};

export type ClarificationTurn = {
  "question": string;
  "answer": string;
};

export type CountryComparison = {
  "available": boolean;
  "period": (string | null);
  "base_geography": string;
  "category_or_product": string;
  "measurement_type": string;
  "tax_basis": (TaxBasis | null);
  "unit": string;
  "missing_selections": Array<string>;
  "items": Array<CountryDifference>;
  "sources": Array<SourceStatus>;
  "explanation": Explanation;
};

export type CountryDifference = {
  "geography": NamedCode;
  "value": string;
  "difference_from_base": string;
  "difference_unit": string;
  "relative_difference_percent": (string | null);
  "observation_id": number;
  "status": ObservationStatus;
};

export type CountryResult = {
  "kind": "country_comparison";
  "domain": "fuel" | "inflation";
  "data": CountryComparison;
};

export type Coverage = {
  "series_id": number;
  "source_code": "ec_weekly_oil_bulletin" | "eurostat_prc_hicp_minr" | "ecb_exr";
  "geography_code": (string | null);
  "category_code": (string | null);
  "measurement_type": string;
  "tax_basis": (string | null);
  "quote_currency": (string | null);
  "unit_code": string;
  "first_period": (string | null);
  "latest_period": (string | null);
};

export type CurrenciesOperation = {
  "kind": "supported_currencies";
};

export type CurrenciesResult = {
  "kind": "supported_currencies";
  "items": Array<NamedCode>;
  "sources": Array<SourceStatus>;
};

export type Evidence = {
  "domain": "fuel" | "inflation" | "exchange-rates";
  "observation_id": number;
  "series_id": number;
  "period": string;
  "source": Attribution;
  "source_series_key": string;
  "unit_code": string;
  "geography_code": (string | null);
  "category_code": (string | null);
  "tax_basis": (string | null);
  "ingestion_run_id": number;
  "imported_at": (string | null);
  "observation_publication_date": (string | null);
  "original_values": Record<string, (string | string | number | null)>;
  "artifact": EvidenceArtifact;
  "revision_artifacts": Array<EvidenceArtifact>;
  "revisions": Array<RevisionEvidence>;
  "revisions_has_more": boolean;
};

export type EvidenceArtifact = {
  "id": number;
  "url": string;
  "sha256": string;
  "retrieved_at": string;
  "publication_date": (string | null);
  "published_at": (string | null);
  "source_updated_at": (string | null);
};

export type ExchangeHistory = {
  "start": string;
  "end": string;
  "limit": number;
  "currency": string;
  "inverse": boolean;
};

export type ExchangeHistoryOperation = {
  "kind": "exchange_history";
  "query": ExchangeHistory;
};

export type ExchangeLatest = {
  "as_of": (string | null);
  "currencies": string;
  "inverse": boolean;
  "comparison_date": (string | null);
};

export type ExchangeLatestOperation = {
  "kind": "exchange_latest";
  "query": ExchangeLatest;
};

export type ExchangeMetric = {
  "observation_id": number;
  "series_id": number;
  "indicator_id": string;
  "indicator_name": string;
  "period": string;
  "value": string;
  "status": ObservationStatus;
  "publication_date": (string | null);
  "observation_freshness": "current" | "stale";
  "source_code": "ec_weekly_oil_bulletin" | "eurostat_prc_hicp_minr" | "ecb_exr";
  "comparison": Change;
  "explanation": Explanation;
  "evidence_path": string;
  "base_currency": "EUR";
  "quote_currency": string;
  "unit": string;
  "measurement_type": "reference_rate";
  "period_type": "reference_date";
  "quote_convention": "1 EUR = value quote-currency units";
  "source_precision": number;
  "inverse_rate": (string | null);
  "inverse_unit": (string | null);
  "inverse_is_derived": (boolean | null);
};

export type ExchangeResponse = {
  "available": boolean;
  "missing_selections": Array<string>;
  "sources": Array<SourceStatus>;
  "page": PageInfo;
  "items": Array<ExchangeMetric>;
};

export type ExchangeResult = {
  "kind": "exchange-rates";
  "data": ExchangeResponse;
};

export type Explanation = {
  "rule_version": "1";
  "what_changed": string;
  "what_it_means": string;
  "why_it_might_matter": string;
  "limitations": Array<string>;
};

export type FuelCompareOperation = {
  "kind": "fuel_compare";
  "query": FuelCompareQuery;
};

export type FuelCompareQuery = {
  "as_of": (string | null);
  "countries": string;
  "base_country": string;
  "product": FuelProduct;
  "tax_basis": TaxBasis;
  "period": (string | null);
};

export type FuelHistory = {
  "start": string;
  "end": string;
  "limit": number;
  "country": string;
  "product": FuelProduct;
  "tax_basis": TaxBasis;
};

export type FuelHistoryOperation = {
  "kind": "fuel_history";
  "query": FuelHistory;
};

export type FuelLatest = {
  "as_of": (string | null);
  "countries": string;
  "product": (FuelProduct | null);
  "tax_basis": TaxBasis;
};

export type FuelLatestOperation = {
  "kind": "fuel_latest";
  "query": FuelLatest;
};

export type FuelMetric = {
  "observation_id": number;
  "series_id": number;
  "indicator_id": string;
  "indicator_name": string;
  "period": string;
  "value": string;
  "status": ObservationStatus;
  "publication_date": (string | null);
  "observation_freshness": "current" | "stale";
  "source_code": "ec_weekly_oil_bulletin" | "eurostat_prc_hicp_minr" | "ecb_exr";
  "comparison": Change;
  "explanation": Explanation;
  "evidence_path": string;
  "geography": NamedCode;
  "product": FuelProduct;
  "tax_basis": TaxBasis;
  "unit": "EUR/litre";
  "measurement_type": "price";
  "period_type": "reference_week";
};

export type FuelProduct = "euro_super_95" | "automotive_diesel";

export type FuelResponse = {
  "available": boolean;
  "missing_selections": Array<string>;
  "sources": Array<SourceStatus>;
  "page": PageInfo;
  "items": Array<FuelMetric>;
};

export type FuelResult = {
  "kind": "fuel";
  "data": FuelResponse;
};

export type FuelTaxOperation = {
  "kind": "fuel_tax_comparison";
  "query": FuelTaxQuery;
};

export type FuelTaxQuery = {
  "as_of": (string | null);
  "country": string;
  "product": FuelProduct;
  "period": (string | null);
};

export type InflationCompareOperation = {
  "kind": "inflation_compare";
  "query": InflationCompareQuery;
};

export type InflationCompareQuery = {
  "as_of": (string | null);
  "countries": string;
  "base_country": string;
  "category": string;
  "measurement": "annual_rate" | "monthly_rate" | "index";
  "period": (string | null);
};

export type InflationHistory = {
  "start": string;
  "end": string;
  "limit": number;
  "country": string;
  "category": string;
  "measurement": "annual_rate" | "monthly_rate" | "index";
};

export type InflationHistoryOperation = {
  "kind": "inflation_history";
  "query": InflationHistory;
};

export type InflationLatest = {
  "as_of": (string | null);
  "countries": string;
  "category": string;
  "measurement": "annual_rate" | "monthly_rate" | "index";
};

export type InflationLatestOperation = {
  "kind": "inflation_latest";
  "query": InflationLatest;
};

export type InflationMetric = {
  "observation_id": number;
  "series_id": number;
  "indicator_id": string;
  "indicator_name": string;
  "period": string;
  "value": string;
  "status": ObservationStatus;
  "publication_date": (string | null);
  "observation_freshness": "current" | "stale";
  "source_code": "ec_weekly_oil_bulletin" | "eurostat_prc_hicp_minr" | "ecb_exr";
  "comparison": Change;
  "explanation": Explanation;
  "evidence_path": string;
  "geography": NamedCode;
  "category": NamedCode;
  "unit": "percent" | "index_points";
  "measurement_type": "annual_rate" | "monthly_rate" | "index";
  "index_base_year": (2025 | null);
  "period_type": "reference_month";
};

export type InflationResponse = {
  "available": boolean;
  "missing_selections": Array<string>;
  "sources": Array<SourceStatus>;
  "page": PageInfo;
  "items": Array<InflationMetric>;
};

export type InflationResult = {
  "kind": "inflation";
  "data": InflationResponse;
};

export type NamedCode = {
  "code": string;
  "name": string;
};

export type ObservationEvidence = {
  "observation_id": number;
  "series_id": number;
  "source_code": "ec_weekly_oil_bulletin" | "eurostat_prc_hicp_minr" | "ecb_exr";
  "period": string;
  "value": string;
  "unit": string;
  "source_attributes": Record<string, (string | number | null)>;
  "status": (string | null);
  "raw_value": (string | null);
  "raw_unit": (string | null);
  "ingestion_run_id": number;
  "imported_at": (string | null);
  "artifact_id": number;
  "sha256": string;
  "source_url": string;
  "retrieved_at": string;
  "observation_publication_date": (string | null);
  "artifact_publication_date": (string | null);
  "source_updated_at": (string | null);
  "evidence_path": string;
};

export type ObservationStatus = {
  "source_status": (string | null);
  "estimated": (boolean | null);
  "provisional": (boolean | null);
};

export type Overview = {
  "geography": NamedCode;
  "fuel": FuelResponse;
  "inflation": InflationResponse;
  "exchange_rates": ExchangeResponse;
};

export type PageInfo = {
  "has_more": boolean;
  "next_start": (string | null);
  "limit": (number | null);
};

export type QualitySummary = {
  "checked_run_id": (number | null);
  "missing_cells_in_last_successful_check": (number | null);
  "revised_observations_in_last_successful_check": (number | null);
  "warning_or_error_codes": Array<string>;
  "sparse_absence_policy": (string | null);
};

export type ReadyPlan = {
  "status": "ready";
  "operation": (FuelLatestOperation | FuelHistoryOperation | FuelCompareOperation | FuelTaxOperation | InflationLatestOperation | InflationHistoryOperation | InflationCompareOperation | ExchangeLatestOperation | ExchangeHistoryOperation | CurrenciesOperation);
};

export type RevisionEvidence = {
  "detected_at": string;
  "previous_run_id": number;
  "replacement_run_id": number;
  "previous_artifact_id": number;
  "replacement_artifact_id": number;
  "previous": Record<string, (string | string | number | string | null)>;
  "replacement": Record<string, (string | string | number | string | null)>;
};

export type SourceStatus = {
  "source": Attribution;
  "available": boolean;
  "expected_frequency": "daily" | "weekly" | "monthly";
  "latest_observation": (string | null);
  "oldest_series_latest": (string | null);
  "observation_freshness": "current" | "stale" | "unavailable";
  "synchronization_status": "never_run" | "current" | "stale" | "failed";
  "running": boolean;
  "last_attempt_at": (string | null);
  "last_success_at": (string | null);
  "source_updated_at": (string | null);
  "latest_artifact_publication_date": (string | null);
  "latest_artifact_published_at": (string | null);
  "freshness_policy": string;
  "quality": QualitySummary;
};

export type SummaryComparison = {
  "comparison": Change;
  "explanation": Explanation;
  "scope": "returned_window" | "latest_comparison";
  "direction": "official" | "inverse";
};

export type TableColumn = {
  "key": string;
  "label": string;
  "value_type": "date" | "decimal" | "text" | "boolean";
};

export type TaxBasis = "with_tax" | "without_tax";

export type TaxResult = {
  "kind": "fuel_tax_comparison";
  "available": boolean;
  "items": Array<FuelMetric>;
  "difference_eur_per_litre": (string | null);
  "relative_difference_percent": (string | null);
  "sources": Array<SourceStatus>;
};

export type Timings = {
  "generation_ms": number;
  "execution_ms": number;
  "analysis_ms": number;
  "total_ms": number;
};

export type VerifiedTable = {
  "columns": Array<TableColumn>;
  "rows": Array<Record<string, (string | boolean | null)>>;
};
