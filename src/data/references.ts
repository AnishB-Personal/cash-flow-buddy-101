import { z } from 'zod';
import { data } from './collectflow';
import { permits } from './demo-policy';
import type { Role } from './records';
import type { CustomerCreate, FYCreate, GSTCreate, TDSCreate } from './api-contracts';

export type Customer = CustomerCreate & { id: number; total_orders?: number; total_billed?: number };
export type FinancialYear = typeof data.financial_years[number];
export type GSTRate = typeof data.tax_rates[number] & { is_active: number };
export type TDSRate = typeof data.tds_rates[number] & { is_active: number };
export type References = { customers: Customer[]; years: FinancialYear[]; gst: GSTRate[]; tds: TDSRate[] };
export type ReferenceAction = 'customer-create' | 'customer-edit' | 'customer-delete' | 'fy-create' | 'fy-seed' | 'fy-delete' | 'gst-create' | 'gst-deactivate' | 'tds-create' | 'tds-deactivate';
export type ReferenceInput = Record<string, string>;
export type ReferenceReview = { action: ReferenceAction; target: string; input: ReferenceInput; context: string; supported: boolean; message: string; before: References; after: References | null };
const text = (max: number) => z.string().trim().max(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Control characters are not allowed');
const required = (max: number) => text(max).refine(value => value.length > 0, 'This field is required');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(value => { const parsed = new Date(`${value}T00:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value; }, 'Invalid calendar date');
export const customerSchema = z.object({
 billing_name: required(200), billing_address: text(1000), city: text(100), state: text(100), country: text(2).refine(v => !v || /^[A-Za-z]{2}$/.test(v), 'Use a two-letter country code'),
 pin_code: text(20).refine(v => !v || /^[A-Za-z0-9 -]+$/.test(v), 'Invalid postal code'),
 gst_number: text(15).transform(v=>v.toUpperCase()).refine(v=>!v || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), 'Enter a valid 15-character GSTIN'),
 phone_1: text(30).refine(v=>!v || /^\+?[\d ()-]{7,30}$/.test(v), 'Invalid phone number'), phone_2: text(30).refine(v=>!v || /^\+?[\d ()-]{7,30}$/.test(v), 'Invalid phone number'),
 contact_person: text(100), designation: text(100), email: text(255).refine(v=>!v || z.string().email().safeParse(v).success, 'Enter a valid email address'),
}).strict();
export const fySchema = z.object({code:required(40),start_date:date,end_date:date}).strict().refine(v=>v.start_date < v.end_date,{message:'Start date must be before end date',path:['end_date']});
// Explicit percent input avoids source ambiguity: rate=1 means 100%, not 1%, in FastAPI.
const percent = required(20).refine(v=>/^\d+(\.\d{1,3})?$/.test(v) && Number.isFinite(Number(v)) && Number(v)<=100, 'Use a percentage from 0 to 100, up to 3 decimal places');
export const gstSchema = z.object({name:required(200),percent,tax_type:z.enum(['GST','EXEMPT']),is_default:z.enum(['0','1'])}).strict();
export const tdsSchema = z.object({section_code:required(100),description:text(500),percent}).strict();
const emptySchema = z.object({}).strict();
export function referenceSchema(action: ReferenceAction) { switch(action) {case 'customer-create':case 'customer-edit':return customerSchema;case 'fy-create':return fySchema;case 'gst-create':return gstSchema;case 'tds-create':return tdsSchema;default:return emptySchema;} }
export const customerExample: ReferenceInput = {billing_name:'Demo Reference Services Pvt Ltd',billing_address:'Demo office, Bengaluru',city:'Bengaluru',state:'Karnataka',country:'IN',pin_code:'560001',gst_number:'29ABCDE1234F1Z5',phone_1:'+91 9000000000',phone_2:'',contact_person:'Demo Contact',designation:'Accounts',email:'accounts@demo-reference.example.com'};
export const fyExample: ReferenceInput = {code:'FY 2027-28',start_date:'2027-04-01',end_date:'2028-03-31'};
export const gstExample: ReferenceInput = {name:'Demo GST 3%',percent:'3',tax_type:'GST',is_default:'0'};
export const tdsExample: ReferenceInput = {section_code:'DEMO 1%',description:'Demo reference only',percent:'1'};
export function customerForm(customer?: Customer): ReferenceInput {return Object.fromEntries(Object.keys(customerExample).map(key=>[key,String(customer?.[key as keyof Customer] ?? (key==='country'?'IN':''))]));}
export function editExample(customer: Customer): ReferenceInput {return {...customerForm(customer),contact_person:'Demo Updated Contact',billing_address:'Updated demo billing address'};}
const demoCustomer: Customer = {...customerSchema.parse(customerExample),id:9001,total_orders:0,total_billed:0};
export function readReferences(): References {return structuredClone({customers:data.customers.map(row=>({id:row.id,billing_name:row.billing_name,billing_address:row.billing_address,state:row.state,gst_number:row.gst_number,contact_person:row.contact_person,phone_1:row.phone,email:row.email,total_orders:row.total_orders,total_billed:row.lifetime_billed})),years:data.financial_years,gst:data.tax_rates.map(row=>({...row,is_active:1})),tds:data.tds_rates.map(row=>({...row,is_active:1}))});}
export const seededYears: FinancialYear[] = [
 {code:'FY 2026-27',start_date:'2026-04-01',end_date:'2027-03-31',is_active:1},{code:'FY 2025-26',start_date:'2025-04-01',end_date:'2026-03-31',is_active:1},{code:'FY 2024-25',start_date:'2024-04-01',end_date:'2025-03-31',is_active:1},
 {code:'FY 2023-24',start_date:'2023-04-01',end_date:'2024-03-31',is_active:1},{code:'FY 2022-23',start_date:'2022-04-01',end_date:'2023-03-31',is_active:1},{code:'FY 2021-22',start_date:'2021-04-01',end_date:'2022-03-31',is_active:1},{code:'FY 2020-21',start_date:'2020-04-01',end_date:'2021-03-31',is_active:1},{code:'FY 2019-20',start_date:'2019-04-01',end_date:'2020-03-31',is_active:1},{code:'FY 2018-19',start_date:'2018-04-01',end_date:'2019-03-31',is_active:1},
];
export function referencePermitted(role: Role, action: ReferenceAction) { return permits(role, action==='customer-create'?'createCustomer':action.startsWith('customer-')?'editCustomer':'references'); }
export function referencePayload(action: ReferenceAction, raw: unknown): CustomerCreate | FYCreate | GSTCreate | TDSCreate | Record<string,never> {
 const parsed = referenceSchema(action).parse(raw);
 if(action==='gst-create') {const v=gstSchema.parse(parsed);return {name:v.name,rate:Number(v.percent)/100,tax_type:v.tax_type,is_default:Number(v.is_default)};}
 if(action==='tds-create') {const v=tdsSchema.parse(parsed);return {section_code:v.section_code,description:v.description,rate:Number(v.percent)/100};}
 return parsed;
}
const same = (a: unknown,b: unknown) => JSON.stringify(a)===JSON.stringify(b);
export function reviewReference(action: ReferenceAction, target: string, raw: unknown, role: Role, refs: References): ReferenceReview {
 if(!referencePermitted(role,action)) throw new Error('This role cannot perform this action.');
 const input = referenceSchema(action).parse(raw) as ReferenceInput;
 const before = structuredClone(refs), after = structuredClone(refs);
 let supported=true, message='Verified nonfinancial demo change. Documents, payments, totals and reporting date remain unchanged.';
 const customer=refs.customers.find(row=>String(row.id)===target);
 switch(action) {
  case 'customer-create':case 'customer-edit': {
   if(action==='customer-edit'&&!customer) throw new Error('Customer not found.');
   if(refs.customers.some(row=>row.billing_name.toLowerCase()===(input['billing_name']??'').toLowerCase() && (action==='customer-create'||String(row.id)!==target))) throw new Error('A customer with this billing name already exists.');
   supported=same(input,action==='customer-create'?customerExample:customer?editExample(customer):null);
   if(supported) {if(action==='customer-create') after.customers.push(structuredClone(demoCustomer));else after.customers=after.customers.map(row=>String(row.id)===target?{...row,...input}:row);}
   break;
  }
  case 'customer-delete':
   if(!customer) throw new Error('Customer not found.');
   if(data.invoices.some(row=>String(row.customer_id)===target) || (customer.total_orders??0)>0) {supported=false;message='Deletion blocked: customer has linked orders/invoices. Historical records remain unchanged.';}
   else after.customers=after.customers.filter(row=>String(row.id)!==target);
   break;
  case 'fy-create':
   if(refs.years.some(row=>row.code===input['code'])) throw new Error('Financial Year already exists.');
   supported=same(input,fyExample);if(supported)after.years.push({...fyExample, is_active:1} as FinancialYear);break;
  case 'fy-seed':
   for(const year of seededYears)if(!after.years.some(row=>row.code===year.code))after.years.push(structuredClone(year));break;
  case 'fy-delete':
   if(!refs.years.some(row=>row.code===target)) throw new Error('Financial year not found.');
   if(data.invoices.some(row=>row.fy_code===target)) {supported=false;message='Deletion blocked: financial year contains orders/invoices.';}else after.years=after.years.filter(row=>row.code!==target);break;
  case 'gst-create':
   supported=same(input,gstExample) && !refs.gst.some(row=>row.id===9001);if(supported)after.gst.push({id:9001,name:'Demo GST 3%',rate:0.03,tax_type:'GST',is_default:0,is_active:1});break;
  case 'tds-create':
   supported=same(input,tdsExample) && !refs.tds.some(row=>row.id===9001);if(supported)after.tds.push({id:9001,section_code:'DEMO 1%',description:'Demo reference only',rate:0.01,is_active:1});break;
  case 'gst-deactivate':case 'tds-deactivate': {
   const rows=action==='gst-deactivate'?after.gst:after.tds;
   const rate=rows.find(row=>String(row.id)===target);if(!rate)throw new Error('Rate not found.');if(!rate.is_active)throw new Error('Rate is already inactive.');rate.is_active=0;
   message='Rate will be inactive for new selections. Historical invoice and payment rates remain unchanged.';break;
  }
 }
 if(!supported && !message.startsWith('Deletion blocked'))message='Review only: custom inputs have no verified scenario outcome. Use the verified example to rehearse saving.';
 return {action,target,input,context:JSON.stringify(refs),supported,message,before,after:supported?after:null};
}
export function createReferenceAdapter() {
 const consumed=new Set<string>();
 return {reset:()=>consumed.clear(),async confirm(review: ReferenceReview,role: Role,refs: References) {
  if(!referencePermitted(role,review.action))throw new Error('Permission changed. No changes applied.');
  const key=JSON.stringify([review.action,review.target,review.input,review.context]);
  if(consumed.has(key))throw new Error('This confirmation was already applied.');
  if(JSON.stringify(refs)!==review.context)throw new Error('Demo context changed. Review again.');
  const verified=reviewReference(review.action,review.target,review.input,role,refs);
  if(!verified.supported||!verified.after)throw new Error(verified.message);
  consumed.add(key);return structuredClone(verified.after);
 }};
}
export const activeGST = (refs: References) => refs.gst.filter(row=>row.is_active===1);
export const activeTDS = (refs: References) => refs.tds.filter(row=>row.is_active===1);