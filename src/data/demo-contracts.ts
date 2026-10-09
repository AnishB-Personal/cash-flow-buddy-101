export type Contract = { area: string; reads: string; writes: string; boundary: string };
export const contracts: Contract[] = [
 { area: 'Customers', reads: 'GET /api/customers; GET /api/customers/{id}', writes: 'POST /api/customers; PUT /api/customers/{id}; DELETE /api/customers/{id}', boundary: 'Supplied customer aggregates exceed available document history; do not reconstruct lifetime totals.' },
 { area: 'Orders / invoices', reads: 'GET /api/invoices; GET /api/invoices/{id}', writes: 'POST /api/invoices; PUT /api/invoices/{id}; DELETE /api/invoices/{id}; POST /api/invoices/{id}/convert-to-invoice; POST /api/invoices/{id}/cancel', boundary: 'Orders and issued invoices share an endpoint, not receivables semantics. Updates are metadata/description-only; issued items stay locked pending clarification.' },
 { area: 'Payments', reads: 'GET /api/payments/recent; invoice detail payment history', writes: 'POST /api/payments; DELETE /api/payments/{id}', boundary: 'Recent results capped at 100. Correction is reversal then replacement, not atomic. Duplicate matching and idempotency are separate.' },
 { area: 'References', reads: 'GET /api/settings/financial-years; GET /api/settings/taxes', writes: 'Financial-year add/seed/delete; GST/TDS add/deactivate', boundary: 'No FY edit or rate edit/reactivation contract. Exact payload mapping remains gated to Stage 1.' },
 { area: 'Targets', reads: 'GET /api/users/{id}/targets; GET /api/dashboard/summary', writes: 'POST /api/users/{id}/targets', boundary: 'Finance/admin reads and writes. One executive summary has no corresponding supplied target detail.' },
 { area: 'Accounts', reads: 'GET /api/users', writes: 'POST /api/users; PUT/DELETE /api/users/{id}; PUT /api/users/{id}/role; POST /api/users/{id}/reset-password', boundary: 'Authenticated list is not admin-only; management remains admin-only. No invite, disable or email contract.' },
 { area: 'Exports', reads: 'GET /api/export/excel', writes: 'POST /api/export/token', boundary: 'One Invoices & Collections worksheet, single-use ticket, source TTL 300 seconds. No Payments Ledger endpoint.' },
];
export const contractGaps = [
 'Source permissions take precedence over conflicting handover sales-edit and target restrictions; viewer document creation remains conservatively denied.',
 'Issued description updates conflict with immutability comments: keep issued line items locked until clarified.',
 'Customer lifetime/count values and executive outstanding may include missing history or unbilled orders. Do not use them as issued receivables.',
 'Future FastAPI aging must accept or return one explicit reporting date; mock reporting remains 30 April 2026.',
 'Credit notes, refunds, partial cancellation and unsupported account/reference changes remain unavailable.',
 'New financial before/after scenarios need verified literal snapshots before their stage is enabled; Stage 0 does not fabricate settlements or issuance.',
];