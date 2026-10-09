// Read-only mapping of approved handoff OpenAPI request schemas. FastAPI remains authoritative.
// Credentials/login contracts intentionally excluded from this mock-only foundation.
import type { Invoice, data } from './collectflow';

export type InvoiceDTO = Invoice;
export type CustomerFixtureDTO = typeof data.customers[number];
// Fixture phone maps to phone_1, never an assumed complete customer response.
export type MetadataUpdatePayload = Pick<InvoiceUpdate, 'remarks' | 'due_date' | 'executive_id'>;

export type ConvertToInvoicePayload = {
 invoice_number: string;
 invoice_date: string;
 due_date?: string | null;
};

export type CustomerCreate = {
 billing_name: string;
 billing_address?: string | null;
 city?: string | null;
 state?: string | null;
 country?: string | null;
 pin_code?: string | null;
 gst_number?: string | null;
 phone_1?: string | null;
 phone_2?: string | null;
 contact_person?: string | null;
 designation?: string | null;
 email?: string | null;
};

export type FYCreate = {
 code: string;
 start_date?: string | null;
 end_date?: string | null;
};

export type GSTCreate = {
 name: string;
 rate: number;
 tax_type?: string | null;
 is_default?: number | null;
};

export type InvoiceCancel = {
 reason?: string | null;
};

export type InvoiceCreate = {
 fy_code: string;
 order_type?: string | null;
 po_date?: string | null;
 po_number?: string | null;
 customer_id: number;
 executive_id?: number | null;
 executive_name?: string | null;
 currency?: string | null;
 exchange_rate?: number | null;
 original_amount?: number | null;
 exclusive_amount: number;
 tax_rate?: number | null;
 tax_amount?: number | null;
 total_amount?: number | null;
 tax_ref?: string | null;
 invoice_number?: string | null;
 invoice_date?: string | null;
 due_date?: string | null;
 remarks?: string | null;
 items?: Array<InvoiceItemCreate> | null;
};

export type InvoiceItemCreate = {
 description: string;
 quantity?: number;
 unit_price?: number;
 tax_rate?: number;
 tax_amount?: number | null;
 total_amount?: number | null;
};

export type InvoiceItemUpdate = {
 id?: number | null;
 description: string;
};

export type InvoiceUpdate = {
 remarks?: string | null;
 po_number?: string | null;
 po_date?: string | null;
 due_date?: string | null;
 customer_id?: number | null;
 executive_id?: number | null;
 invoice_number?: string | null;
 invoice_date?: string | null;
 items?: Array<InvoiceItemUpdate> | null;
};

export type PaymentCreate = {
 invoice_id: number;
 payment_amount?: number;
 tds_amount?: number | null;
 tds_section?: string | null;
 payment_date?: string | null;
 remittance_number?: string | null;
 payment_mode?: string | null;
 notes?: string | null;
 idempotency_key?: string | null;
};

export type TDSCreate = {
 section_code: string;
 description?: string | null;
 rate: number;
};

export type TargetUpdate = {
 fy_code: string;
 yearly_target?: number | string;
 half_yearly_target?: number | string | null;
 quarterly_target?: number | string | null;
 monthly_target?: number | string | null;
 monthly_bottom_line?: number | string | null;
 yearly_bottom_line?: number | string | null;
};

export type UserRoleUpdate = {
 role: string;
 full_name?: string | null;
};

export type UserUpdate = {
 role?: string | null;
 full_name?: string | null;
};
