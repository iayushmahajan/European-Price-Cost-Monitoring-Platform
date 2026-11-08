"""Governed price-cost analyst and dataset/version-isolated saved analyses."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import price_cost_analyst as a
from app.core.config import settings
from app.core.db import get_db
from app.models import QueryHistory
from app.services.price_cost_analyst.workflow import run_analysis

router = APIRouter(prefix="/v1/price-cost/analyst", tags=["price-cost-analyst-v1"])
Database = Annotated[Session, Depends(get_db)]


@router.post("/query", response_model=a.AnalysisResponse)
def analyse(payload: a.AnalysisRequest, request: Request, response: Response, db: Database):
    result, response.status_code = run_analysis(payload, db, request.state.request_id)
    if len(result.model_dump_json().encode("utf-8")) > settings.MAX_RESULT_BYTES:
        return JSONResponse(
            status_code=413,
            content={
                "error": {
                    "code": "response_limit_exceeded",
                    "message": "This response exceeds the configured size limit. Use a shorter question or narrower scope.",
                },
                "request_id": request.state.request_id,
            },
        )
    return result


@router.get("/history", response_model=list[a.AnalysisHistoryItem])
def history(db: Database, limit: Annotated[int, Query(ge=1, le=100)] = 20):
    records = db.scalars(
        select(QueryHistory)
        .where(QueryHistory.snapshot["dataset"].as_string() == "price_cost")
        .order_by(QueryHistory.created_at.desc(), QueryHistory.id.desc())
        .limit(min(limit, settings.QUERY_HISTORY_LIMIT))
    )
    results = []
    for record in records:
        snapshot = record.snapshot or {}
        plan = snapshot.get("plan")
        operation = plan.get("operation") if isinstance(plan, dict) else None
        version = snapshot.get("schema_version")
        results.append(
            a.AnalysisHistoryItem(
                id=record.id,
                question=record.question,
                status=record.status,
                row_count=record.row_count,
                created_at=record.created_at,
                domain=snapshot.get("domain")
                if snapshot.get("domain") in {"fuel", "inflation", "exchange-rates"}
                else None,
                schema_version=version
                if isinstance(version, int) and not isinstance(version, bool)
                else None,
                operation=operation.get("kind") if isinstance(operation, dict) else None,
            )
        )
    return results


@router.get("/history/{item_id}", response_model=a.AnalysisResponse)
def restore(item_id: Annotated[int, Path(ge=1, le=9223372036854775807)], db: Database):
    record = db.get(QueryHistory, item_id)
    if not record or not isinstance(record.snapshot, dict) or record.snapshot.get("dataset") != "price_cost":
        raise HTTPException(404, "Price-cost analysis not found.")
    if type(record.snapshot.get("schema_version")) is not int or record.snapshot.get("schema_version") != 1:
        raise HTTPException(409, "This saved analysis version is unsupported. Run a new analysis.")
    try:
        response = a.AnalysisResponse.model_validate(record.snapshot)
        if len(response.model_dump_json().encode()) > settings.MAX_RESULT_BYTES:
            raise ValueError("Snapshot exceeds current size limit")
        return response
    except (ValidationError, ValueError, TypeError):
        raise HTTPException(
            409, "This saved analysis cannot be restored safely. Run a new analysis."
        ) from None
