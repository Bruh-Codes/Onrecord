from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routers.accounts import router as accounts_router
from app.api.routers.analytics import router as analytics_router
from app.api.routers.businesses import router as businesses_router
from app.api.routers.counterparties import router as counterparties_router
from app.api.routers.documents import router as documents_router
from app.api.routers.internal_storage import router as internal_storage_router
from app.api.routers.me import router as me_router
from app.api.routers.transactions import router as transactions_router
from app.errors import AppError

app = FastAPI(title="Onrecord Credit Readiness API")


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    body = {"error": {"code": exc.code, "message": exc.message}}
    if exc.detail:
        body["error"]["detail"] = exc.detail
    return JSONResponse(status_code=exc.http_status, content=body)


app.include_router(businesses_router)
app.include_router(me_router)
app.include_router(accounts_router)
app.include_router(documents_router)
app.include_router(transactions_router)
app.include_router(counterparties_router)
app.include_router(analytics_router)
app.include_router(internal_storage_router)


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}