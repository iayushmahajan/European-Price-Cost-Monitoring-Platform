import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes.examples import router as examples_router
from app.api.routes.health import router as health_router
from app.api.routes.history import router as history_router
from app.api.routes.price_cost import router as price_cost_router
from app.api.routes.query import router as query_router
from app.api.routes.retail import router as retail_router
from app.core.config import settings
from app.core.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)
app = FastAPI(title=settings.APP_NAME, root_path=settings.API_ROOT_PATH)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_origin_regex=settings.CORS_ALLOWED_ORIGIN_REGEX,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def correlate(request: Request, call_next):
    request.state.request_id = str(uuid4())
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    logger.info(
        "http_request",
        extra={
            "request_id": request.state.request_id,
            "http_status": response.status_code,
            "latency_ms": round((time.perf_counter() - start) * 1000),
        },
    )
    return response


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_request",
                "message": (
                    "Check the supported query parameters, selection codes, and date/size limits."
                    if request.url.path.startswith("/v1/price-cost")
                    else "Check the question and clarification fields and their length limits."
                ),
            },
            "request_id": request.state.request_id,
        },
    )


@app.exception_handler(SQLAlchemyError)
async def database_unavailable(request: Request, exc: SQLAlchemyError):
    logger.warning("database_unavailable", extra={"request_id": request.state.request_id})
    return JSONResponse(
        status_code=503,
        content={
            "error": {
                "code": "database_unavailable",
                "message": "The database is unavailable. Please try again later.",
            },
            "request_id": request.state.request_id,
        },
    )


for router in (
    health_router,
    examples_router,
    history_router,
    query_router,
    retail_router,
    price_cost_router,
):
    app.include_router(router)


@app.get("/")
def root():
    return {"message": "Eurostat Retail Intelligence Platform API", "docs": "/docs"}
