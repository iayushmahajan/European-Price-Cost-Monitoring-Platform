"""One intent-provider call; validated deterministic execution and bounded snapshots."""

import logging
import time
from datetime import datetime, timezone

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.api.schemas import price_cost_analyst as a
from app.api.schemas.query import AppError
from app.core.config import settings
from app.ingestion.freshness import source_today
from app.models import QueryHistory
from app.services.price_cost_analyst.execution import ExecutionLimitError, domain_for, execute_operation
from app.services.price_cost_analyst.planning import (
    UNSUPPORTED,
    check_plan,
    clarification_question,
    generate_plan,
    mentions,
    preflight,
)
from app.services.price_cost_analyst.presentation import present
from app.services.sql_generator import ProviderError

logger = logging.getLogger(__name__)


def within_size(response):
    return len(response.model_dump_json().encode("utf-8")) <= settings.MAX_RESULT_BYTES


def persist(db, response):
    item = QueryHistory(
        question=response.question,
        generated_sql="",
        status=response.status,
        explanation="Price/cost analyst v1: approved typed operation; no generated SQL.",
        row_count=response.row_count,
        execution_time_ms=response.timings.execution_ms,
        created_at=response.created_at,
    )
    try:
        db.add(item)
        db.flush()
        response.id = item.id
        if not within_size(response):
            raise ExecutionLimitError("Snapshot exceeds response bound")
        item.snapshot = response.model_dump(mode="json")
        db.commit()
    except (SQLAlchemyError, ExecutionLimitError):
        db.rollback()
        response.id = None
        response.warnings.append("This analysis could not be saved to history.")
        logger.warning("price_cost_history_write_failed", extra={"request_id": response.request_id})


def run_analysis(payload, db, request_id):
    start = time.perf_counter()
    domains = mentions(payload)[-1]
    response = a.AnalysisResponse(
        domain=next(iter(domains)) if len(domains) == 1 else None,
        request_id=request_id,
        question=payload.question,
        clarification=payload.clarification,
        status="failed",
        created_at=datetime.now(timezone.utc),
        assessment_date=source_today(),
    )
    status_code = 200
    stage = start
    try:
        plan = preflight(payload) or generate_plan(payload)
        # Revalidate at the execution boundary, including mocked/injected provider implementations.
        plan = a.PlannerOutput.model_validate_json(
            a.PlannerOutput(plan=plan).model_dump_json(), strict=True
        ).plan
        plan = check_plan(payload, plan)
        if isinstance(plan, a.ClarificationPlan) and len(payload.clarification) >= 3:
            plan = a.BlockedPlan(status="blocked", reason="unsupported_operation")
        response.timings.generation_ms = round((time.perf_counter() - stage) * 1000)
        response.plan = plan
        if isinstance(plan, a.ClarificationPlan):
            response.status = "needs_clarification"
            response.clarification_question = clarification_question(payload, plan.reason)
            response.answer = response.clarification_question
        elif isinstance(plan, a.BlockedPlan):
            response.status = "blocked"
            response.answer = UNSUPPORTED[plan.reason]
        else:
            response.domain = domain_for(plan.operation)
            stage = time.perf_counter()
            try:
                result, evidence, response.assessment_date = execute_operation(plan.operation)
            finally:
                response.timings.execution_ms = round((time.perf_counter() - stage) * 1000)
            stage = time.perf_counter()
            response = present(response, plan.operation, result, evidence)
            response.timings.analysis_ms = round((time.perf_counter() - stage) * 1000)
            if not within_size(response):
                raise ExecutionLimitError("Result exceeds response bound")
    except ProviderError as exc:
        response.status = "failed"
        status_code = exc.http_status
        # Do not echo provider bodies, model text, endpoint URLs or arbitrary exception messages.
        public = {
            "provider_timeout": "The intent provider timed out. Please try again.",
            "provider_not_configured": "The intent provider is not configured.",
            "provider_unavailable": "The intent provider is unavailable.",
            "provider_rate_limited": "The intent provider request limit was reached.",
            "invalid_model_output": "The intent response was invalid or did not preserve your requested scope. Please rephrase.",
        }
        response.error = AppError(
            code=exc.code if exc.code in public else "provider_unavailable",
            message=public.get(exc.code, public["provider_unavailable"]),
        )
        response.answer = response.error.message
    except (ValidationError, ValueError, TypeError, AttributeError, ArithmeticError):
        response.status = "failed"
        status_code = 502
        response.error = AppError(
            code="invalid_model_output",
            message="The intent response could not be validated safely. Please rephrase.",
        )
        response.answer = response.error.message
    except ExecutionLimitError:
        response.status = "failed"
        status_code = 422
        response.error = AppError(
            code="analysis_limit_exceeded",
            message="This analysis exceeds the configured result limits. Select fewer series or a narrower date window.",
        )
        response.answer = response.error.message
    except SQLAlchemyError:
        response.status = "failed"
        status_code = 503
        response.error = AppError(
            code="data_unavailable",
            message="The validated dataset could not be read. Please try again later.",
        )
        response.answer = response.error.message
    if response.status == "failed":
        response.verified_data = None
        response.evidence = []
        response.table = a.VerifiedTable()
        response.row_count = 0
        response.summary_comparison = None
        response.explanation = None
        response.findings = []
        response.assumptions = []
        response.follow_up_questions = []
        response.warnings = []
        response.possibly_truncated = False
    if not response.timings.generation_ms and response.timings.execution_ms == 0:
        response.timings.generation_ms = round((time.perf_counter() - start) * 1000)
    response.timings.total_ms = round((time.perf_counter() - start) * 1000)
    persist(db, response)
    logger.info(
        "price_cost_analysis_completed",
        extra={
            "request_id": request_id,
            "status": response.status,
            "error_code": response.error.code if response.error else None,
        },
    )
    return response, status_code
