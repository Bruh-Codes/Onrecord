class AppError(Exception):
    """Raised anywhere in the app; rendered by the handler in app/api/main.py
    into the {"error": {...}} shape from specs/09-api.md §3. `code` is a stable
    string the frontend switches on — never change one once shipped."""

    def __init__(self, code: str, message: str, http_status: int, detail: dict | None = None):
        self.code = code
        self.message = message
        self.http_status = http_status
        self.detail = detail
        super().__init__(message)


def duplicate_document(existing_document_id: str) -> AppError:
    return AppError(
        code="DUPLICATE_DOCUMENT",
        message="You have already uploaded this file.",
        http_status=409,
        detail={"existing_document_id": existing_document_id},
    )


def file_too_large(max_bytes: int) -> AppError:
    return AppError(
        code="FILE_TOO_LARGE",
        message=f"File exceeds the {max_bytes} byte limit.",
        http_status=413,
    )


def unsupported_mime(mime: str) -> AppError:
    return AppError(
        code="UNSUPPORTED_MIME",
        message=f"File type '{mime}' is not supported.",
        http_status=415,
    )


def not_found(code: str, message: str) -> AppError:
    return AppError(code=code, message=message, http_status=404)


def forbidden(message: str = "You don't have access to this resource.") -> AppError:
    return AppError(code="FORBIDDEN", message=message, http_status=403)


def unauthorized(message: str = "Missing or invalid credentials.") -> AppError:
    return AppError(code="UNAUTHORIZED", message=message, http_status=401)
