from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routers.businesses import router as businesses_router
from app.api.routers.documents import router as documents_router
from app.errors import AppError

app = FastAPI(title="Sankofa Credit Readiness API")


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    body = {"error": {"code": exc.code, "message": exc.message}}
    if exc.detail:
        body["error"]["detail"] = exc.detail
    return JSONResponse(status_code=exc.http_status, content=body)


app.include_router(businesses_router)
app.include_router(documents_router)


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}
