# 14 · Paystack auto-sync

The owner pastes their Paystack secret key on Integrations. OnRecord reads
their Paystack records every 5 minutes (worker beat `paystack.sync_due`) and on
**Sync now**.

## Key safety
- Paystack has no OAuth for other apps and no read-only keys. The client
  (`app/services/paystack/client.py`) only makes GET requests; keep it that way.
- The key is checked against Paystack, encrypted with Fernet (key derived from
  `PAYSTACK_KEY_SECRET`), shown only as its last 4 characters, never logged or
  returned, and set to NULL on disconnect.
- `sk_test_` keys are allowed and labelled "Test mode" (demo use).

## What lands in the ledger
One POS account (provider PAYSTACK) and one `processor_statement` document per
business and mode. Evidence weight 1.0, like a statement.

| Paystack | Ledger row | provider_reference |
|---|---|---|
| Successful transaction | money in, revenue/sales, fee kept in `fee_pesewas` | `txn:<id>` |
| That day's fees | one money-out row per day, opex/bank_charges | `fees:<date>` |
| Processed refund | money out, opex/refunds | `refund:<id>` |
| Successful settlement | money out, `internal_transfer` (kept out of totals) | `payout:<id>` |

Non-GHS records are skipped and counted. The first sync reads 365 days; later
syncs re-read 2 days before the last one. Reconnecting reuses the same ledger,
so nothing is added twice. The document period starts at the first payment.

## Not done yet
Matching payouts to bank statement deposits; webhooks (Paystack allows one URL
per account, so using it could break the owner's own setup).
