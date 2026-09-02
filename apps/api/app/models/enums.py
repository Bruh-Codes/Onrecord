from enum import StrEnum


class EntityType(StrEnum):
    SOLE_PROP = "sole_prop"
    PARTNERSHIP = "partnership"
    LTD = "ltd"
    NGO = "ngo"


class AccountKind(StrEnum):
    MOMO = "momo"
    BANK = "bank"
    POS = "pos"
    CASH_BOOK = "cash_book"


class Provider(StrEnum):
    MTN = "MTN"
    TELECEL = "TELECEL"
    AT = "AT"
    GCB = "GCB"
    FIDELITY = "FIDELITY"
    ABSA = "ABSA"
    STANBIC = "STANBIC"
    ECOBANK = "ECOBANK"
    CBG = "CBG"
    OTHER_BANK = "OTHER_BANK"


class DocType(StrEnum):
    MOMO_STATEMENT = "momo_statement"
    MOMO_MERCHANT_STATEMENT = "momo_merchant_statement"
    BANK_STATEMENT = "bank_statement"
    INVOICE_ISSUED = "invoice_issued"
    INVOICE_RECEIVED = "invoice_received"
    RECEIPT = "receipt"
    INFORMAL_LEDGER = "informal_ledger"
    REGISTRATION_CERT = "registration_cert"
    TAX_DOC = "tax_doc"
    TENANCY_AGREEMENT = "tenancy_agreement"
    STOCK_LIST = "stock_list"
    FINANCIAL_STATEMENT = "financial_statement"
    CASHFLOW_PROJECTION = "cashflow_projection"
    ID_DOCUMENT = "id_document"
    OTHER = "other"


class DocStatus(StrEnum):
    RECEIVED = "received"
    CLASSIFIED = "classified"
    EXTRACTED = "extracted"
    RECONCILIATION_FAILED = "reconciliation_failed"
    FAILED = "failed"
    SUPERSEDED = "superseded"


class Direction(StrEnum):
    IN = "in"
    OUT = "out"


class ValueKind(StrEnum):
    EXTRACTED = "extracted"
    DERIVED = "derived"
    DECLARED = "declared"


class CategorySource(StrEnum):
    RULE = "rule"
    KNN = "knn"
    LLM = "llm"
    HUMAN = "human"
    OWNER_STATED = "owner_stated"


class CounterpartyKind(StrEnum):
    CUSTOMER = "customer"
    SUPPLIER = "supplier"
    STAFF = "staff"
    LENDER = "lender"
    TAX = "tax"
    SELF = "self"
    UNKNOWN = "unknown"


class GapKind(StrEnum):
    MISSING_DOCUMENT = "missing_document"
    MISSING_PERIOD = "missing_period"
    UNEXPLAINED_TXN = "unexplained_txn"
    AMBIGUOUS_CATEGORY = "ambiguous_category"
    INCONSISTENCY = "inconsistency"
    MISSING_FACT = "missing_fact"


class GapSeverity(StrEnum):
    BLOCKER = "blocker"
    MAJOR = "major"
    MINOR = "minor"


class GapStatus(StrEnum):
    OPEN = "open"
    ANSWERED = "answered"
    DOCUMENT_RECEIVED = "document_received"
    WAIVED = "waived"
    RESOLVED = "resolved"


class Band(StrEnum):
    NOT_READY = "not_ready"
    DEVELOPING = "developing"
    NEARLY_READY = "nearly_ready"
    LENDER_READY = "lender_ready"


class Role(StrEnum):
    OWNER = "owner"
    REVIEWER = "reviewer"
    ADMIN = "admin"
