import { apiClient } from "@/lib/api-client";
import { useEffect } from "react";
import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Pencil, Trash2, X, Search, ArrowUpRight, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money, type Invoice } from '@/data/collectflow';
import { dateLabel, agingAsOf } from '@/data/records';
import { customerExample, customerForm, editExample, fyExample, gstExample, tdsExample, referenceSchema, referencePermitted, reviewReference, type Customer, type ReferenceAction, type ReferenceInput, type ReferenceReview } from '@/data/references';
import { useMockSession } from './session';
import { FormSection, FieldError } from './demo-controls';
import { EmptyState, FilterChoice } from './controls';

type Operation = {action:ReferenceAction;target:string;label:string;values:ReferenceInput;example:ReferenceInput};
const names: Record<string,string> = {billing_name:'Billing name',billing_address:'Billing address',city:'City',state:'State',country:'Country code',pin_code:'Postal code',gst_number:'GSTIN',phone_1:'Primary phone',phone_2:'Secondary phone',contact_person:'Contact person',designation:'Designation',email:'Email',code:'Financial year code',start_date:'Start date',end_date:'End date',name:'Rate name',percent:'Rate (%)',tax_type:'Tax type',is_default:'Default rate',section_code:'TDS section',description:'Description'};
function Workflow({operation,container,close,onSuccess,liveCustomers}: {operation:Operation;container?:HTMLElement|null|undefined;close:()=>void;onSuccess?:()=>void;liveCustomers?:Customer[]}) {
 const {role,references,confirmReference,revision,fy}=useMockSession();
 const isLive = apiClient.getMode() === "live";
 const currentUser = apiClient.getCurrentUser();
 const effectiveRole = isLive ? (currentUser?.role ?? "viewer") : role;
 const [input,setInput]=useState(operation.values),[errors,setErrors]=useState<Record<string,string>>({}),[error,setError]=useState(''),[step,setStep]=useState<'form'|'review'|'confirm'|'result'>('form'),[review,setReview]=useState<ReferenceReview|null>(null),[pending,setPending]=useState(false),[discard,setDiscard]=useState(false),[dirty,setDirty]=useState(false);
 const submitting=useRef(false),origin=useRef({revision,fy,role});
 const trigger=useRef<HTMLElement|null>(typeof document==='undefined'?null:document.activeElement as HTMLElement);
 const allowed=isLive ? (effectiveRole === 'admin' || effectiveRole === 'finance' || (operation.action === 'customer-create' && effectiveRole === 'sales')) : referencePermitted(effectiveRole,operation.action);
 function requestClose(){if(pending)return;if(dirty&&step!=='result')setDiscard(true);else close();}
 function prepare(){
   const parsed=referenceSchema(operation.action).safeParse(input);
   if(!parsed.success){setErrors(Object.fromEntries(parsed.error.issues.map(issue=>[String(issue.path[0]),issue.message])));return;}
   setErrors({});
   try{
     if (isLive) {
       const dataObj = parsed.data as Record<string, string>;
       if (operation.action.startsWith('customer-')) {
         const currentCustomer = liveCustomers?.find(c => String(c.id) === operation.target);
         const diffInput: ReferenceInput = (operation.action === 'customer-create' ? dataObj : {
           ...(currentCustomer ? customerForm(currentCustomer) : {}),
           ...dataObj,
         }) as ReferenceInput;
         setReview({
           action: operation.action,
           target: operation.target,
           input: diffInput,
           message: operation.action === 'customer-create' ? `Create customer ${diffInput['billing_name'] || ''}` : operation.action === 'customer-edit' ? `Update customer ${currentCustomer?.billing_name || operation.target}` : `Delete customer ${currentCustomer?.billing_name || operation.target}`,
           supported: true,
           context: 'live',
           before: references,
           after: references,
         });
         setStep('review');
         setError('');
         return;
       }
       if (operation.action === 'fy-create') {
         setReview({
           action: operation.action,
           target: '',
           input: dataObj,
           message: `Create financial year ${dataObj['code'] || ''}`,
           supported: true,
           context: 'live',
           before: references,
           after: references,
         });
         setStep('review');
         setError('');
         return;
       }
       if (operation.action === 'fy-delete') {
         setReview({
           action: operation.action,
           target: operation.target,
           input: {},
           message: `Delete financial year ${operation.target}`,
           supported: true,
           context: 'live',
           before: references,
           after: references,
         });
         setStep('review');
         setError('');
         return;
       }
       if (operation.action === 'gst-create') {
         setReview({
           action: operation.action,
           target: '',
           input: dataObj,
           message: `Create GST rate ${dataObj['name'] || ''}`,
           supported: true,
           context: 'live',
           before: references,
           after: references,
         });
         setStep('review');
         setError('');
         return;
       }
       if (operation.action === 'tds-create') {
         setReview({
           action: operation.action,
           target: '',
           input: dataObj,
           message: `Create TDS section ${dataObj['section_code'] || ''}`,
           supported: true,
           context: 'live',
           before: references,
           after: references,
         });
         setStep('review');
         setError('');
         return;
       }
       // Unsupported actions in live mode
       setReview({
         action: operation.action,
         target: operation.target,
         input: dataObj,
         message: 'Stage Notice: This action is not supported by the live backend in Stage 4C.2. Statutory rate deactivation and financial year seeding are deferred.',
         supported: false,
         context: 'live',
         before: references,
         after: null,
       });
       setStep('review');
       setError('');
       return;
     }
     setReview(reviewReference(operation.action,operation.target,parsed.data,effectiveRole,references));
     setStep('review');
     setError('');
     origin.current={revision,fy,role};
   }catch(e){setError(e instanceof Error?e.message:'Review failed. Try again.');}
 }
 async function confirm(){
   if(!review||submitting.current)return;
   submitting.current=true;
   setPending(true);
   setError('');
   try {
     if (isLive) {
       if (operation.action === 'customer-create') {
         await apiClient.createCustomer({
           billing_name: input['billing_name'] || '',
           billing_address: input['billing_address'] || undefined,
           city: input['city'] || undefined,
           state: input['state'] || undefined,
           country: input['country'] || 'IN',
           pin_code: input['pin_code'] || undefined,
           gst_number: input['gst_number'] || undefined,
           contact_person: input['contact_person'] || undefined,
           designation: input['designation'] || undefined,
           email: input['email'] || undefined,
           phone_1: input['phone_1'] || undefined,
           phone_2: input['phone_2'] || undefined,
         });
       } else if (operation.action === 'customer-edit') {
         const cid = Number(operation.target);
         await apiClient.updateCustomer(cid, {
           billing_name: input['billing_name']?.trim() || undefined,
           billing_address: input['billing_address']?.trim() || undefined,
           city: input['city'] !== undefined ? (input['city'].trim() || null) : undefined,
           state: input['state']?.trim() || undefined,
           country: input['country']?.trim() || undefined,
           pin_code: input['pin_code'] !== undefined ? (input['pin_code'].trim() || null) : undefined,
           gst_number: input['gst_number'] !== undefined ? (input['gst_number'].trim() || null) : undefined,
           contact_person: input['contact_person'] !== undefined ? (input['contact_person'].trim() || null) : undefined,
           designation: input['designation'] !== undefined ? (input['designation'].trim() || null) : undefined,
           email: input['email'] !== undefined ? (input['email'].trim() || null) : undefined,
           phone_1: input['phone_1'] !== undefined ? (input['phone_1'].trim() || null) : undefined,
           phone_2: input['phone_2'] !== undefined ? (input['phone_2'].trim() || null) : undefined,
         });
       } else if (operation.action === 'customer-delete') {
         const cid = Number(operation.target);
         await apiClient.deleteCustomer(cid);
       } else if (operation.action === 'fy-create') {
         await apiClient.createFinancialYear({
           code: input['code'] || '',
           start_date: input['start_date'] || undefined,
           end_date: input['end_date'] || undefined,
         });
       } else if (operation.action === 'fy-delete') {
         await apiClient.deleteFinancialYear(operation.target);
       } else if (operation.action === 'gst-create') {
         await apiClient.createGstRate({
           name: input['name'] || '',
           rate: Number(input['percent'] || 0),
           tax_type: input['tax_type'] || 'GST',
           is_default: input['is_default'] === '1',
         });
       } else if (operation.action === 'tds-create') {
         await apiClient.createTdsRate({
           section_code: input['section_code'] || '',
           rate: Number(input['percent'] || 0),
           description: input['description'] || undefined,
         });
       } else {
         throw new Error('This action is not supported by the live backend in Stage 4C.2.');
       }
       onSuccess?.();
     } else {
       if(origin.current.revision!==revision||origin.current.fy!==fy||origin.current.role!==role)throw new Error('Context changed. Return to the form and review again.');
       await confirmReference(review);
     }
     setStep('result');
     setDirty(false);
   } catch(e) {
     setError(e instanceof Error?e.message:'Submission failed. No changes applied. Try again.');
   } finally {
     setPending(false);
     submitting.current=false;
   }
 }
 return <Dialog.Root open onOpenChange={open=>{if(!open)requestClose();}}><Dialog.Portal container={container}><Dialog.Overlay className="cf-overlay"/><Dialog.Content className="cf-app cf-drawer cf-demo-drawer" onEscapeKeyDown={event=>{event.preventDefault();requestClose();}} onInteractOutside={event=>event.preventDefault()} onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus();}}><header className="cf-drawer-header"><div><Dialog.Title>{operation.label}</Dialog.Title><Dialog.Description>{isLive ? 'Live sandbox mutation · PostgreSQL' : `Isolated demo · ${agingAsOf()}`}</Dialog.Description></div><Button variant="ghost" size="icon" aria-label="Close reference workflow" disabled={pending} onClick={requestClose}><X/></Button></header><div className="cf-drawer-body">
 <div className="cf-demo-progress">{['Form','Review','Confirm','Result'].map(label=><span key={label} aria-current={label.toLowerCase()===step?'step':undefined}>{label}</span>)}</div>
 {!allowed?<p role="alert">This role cannot perform this action. No records changed.</p>:step==='form'?<form onSubmit={e=>{e.preventDefault();prepare();}}><FormSection title="Reference details"><div className="cf-reference-fields">{Object.keys(input).map(key=><div key={key}><label htmlFor={`ref-${key}`}>{names[key]}</label>{key==='tax_type'?<select id={`ref-${key}`} value={input[key]} onChange={e=>{setInput({...input,[key]:e.target.value});setDirty(true);}}><option>GST</option><option>EXEMPT</option></select>:key==='is_default'?<input id={`ref-${key}`} type="checkbox" checked={input[key]==='1'} onChange={e=>{setInput({...input,[key]:e.target.checked?'1':'0'});setDirty(true);}}/>:<Input id={`ref-${key}`} type={key.endsWith('_date')?'date':key==='email'?'email':'text'} maxLength={key==='billing_address'?500: key==='description'?255:key==='email'?150:key==='billing_name'?150:key==='contact_person'?100:50} value={input[key]} aria-invalid={Boolean(errors[key])} aria-describedby={`error-${key}`} onChange={e=>{setInput({...input,[key]:e.target.value});setDirty(true);}}/>}<FieldError id={`error-${key}`} message={errors[key]}/></div>)}</div>{!Object.keys(input).length&&<p>{operation.label}: {operation.target || 'Standard Indian financial years'}. Linked records and historic rates are preserved.</p>}</FormSection>{Object.keys(input).length>0&&<Button type="button" variant="outline" onClick={()=>{setInput(operation.example);setDirty(true);setErrors({});setError('');}}>Use verified example</Button>}<div className="cf-demo-actions"><Button type="submit">Review changes<ArrowUpRight size={16}/></Button></div></form>:step==='result'?<FormSection title={isLive ? "Operation result" : "Demo result"}><p role="status">{isLive ? "Changes successfully committed to live PostgreSQL database." : "Verified demo reference change applied. No actual financial records were modified."}</p><Button variant="outline" onClick={close}>Return to list</Button></FormSection>:review?<><FormSection title="Intended reference change"><dl className="cf-detail-grid"><div><dt>Action</dt><dd>{operation.label}</dd></div><div><dt>Record</dt><dd>{operation.target||input['billing_name']||input['code']||input['name']||input['section_code']||'Standard years'}</dd></div>{Object.entries(review.input).map(([key,value])=><div key={key}><dt>{names[key]}</dt><dd>{key==='is_default'?(value==='1'?'Yes':'No'):value||'—'}</dd></div>)}</dl></FormSection><p className="cf-drawer-message" role="status">{review.message}</p><FormSection title="Financial impact"><p>{isLive ? "Customer master updated in live database. Issued invoice snapshots remain historically preserved." : "All invoice billing snapshots, amounts, payments, targets and aging stay unchanged."}</p></FormSection>{step==='confirm'&&<p className="cf-drawer-message">Confirm {operation.label.toLowerCase()} {isLive ? 'in live database' : 'in this isolated demo'}?</p>}<div className="cf-demo-actions"><Button variant="outline" disabled={pending} onClick={()=>{setStep('form');setError('');}}>Back to form</Button>{(isLive || review.supported)&&<Button disabled={pending||!allowed} onClick={()=>{if(step==='review')setStep('confirm');else void confirm();}}>{pending?'Submitting…':step==='review'?'Continue to confirmation':'Confirm reference change'}</Button>}</div></>:null}
 {error&&<p className="cf-field-error" role="alert">{error}</p>}{discard&&<div className="cf-discard"><p>Discard unsaved reference inputs?</p><Button variant="outline" onClick={()=>setDiscard(false)}>Keep editing</Button><Button onClick={close}>Discard inputs</Button></div>}
 </div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
function CustomerDetails({customer,container,close,openRecord}: {customer:Customer;container?:HTMLElement|null|undefined;close:()=>void;openRecord:(row:Invoice,kind:'order'|'invoice')=>void}) {
 const {demo,fy}=useMockSession();const [tab,setTab]=useState('Invoices');
 const isLive = apiClient.getMode() === "live";
 const trigger = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : (document.activeElement as HTMLElement));
 const records=isLive ? [] : demo.invoices.filter(row=>row.customer_id===customer.id&&row.fy_code===fy);
 const issued=records.filter(row=>row.invoice_number),orders=records.filter(row=>!row.invoice_number);
 const payments=issued.flatMap(row=>row.payments.map(payment=>({row,payment})));
 return <Dialog.Root open onOpenChange={value=>{if(!value)close();}}><Dialog.Portal container={container}><Dialog.Overlay className="cf-overlay"/><Dialog.Content className="cf-app cf-drawer" onEscapeKeyDown={event=>{event.preventDefault();close();}} onCloseAutoFocus={event=>{if(trigger.current){event.preventDefault();trigger.current.focus();trigger.current=null;}}}><header className="cf-drawer-header"><div><Dialog.Title>{customer.billing_name}</Dialog.Title><Dialog.Description>{isLive ? 'Live Customer Details · PostgreSQL' : `Customer details · ${fy}`}</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close customer details"><X/></Button></Dialog.Close></header><div className="cf-drawer-body"><FormSection title="Billing and contact"><dl className="cf-detail-grid">{Object.entries(customerForm(customer)).map(([key,value])=><div key={key}><dt>{names[key]}</dt><dd>{value||'Not supplied'}</dd></div>)}</dl></FormSection><FormSection title="Supplied customer aggregates"><dl className="cf-detail-grid"><div><dt>Total Orders</dt><dd>{customer.total_orders??0}</dd></div><div><dt>Total Billed</dt><dd>{customer.total_billed===undefined?'0.00':money(customer.total_billed)}</dd></div></dl>{!isLive&&<p className="cf-muted">Incomplete history: lifetime aggregates exceed supplied records. They are not issued-receivable totals.</p>}</FormSection>{isLive ? <div className="cf-stage-notice" role="status"><p><strong>Stage Notice:</strong> Transaction history (Invoices, Orders, Settlements) is scheduled for Stage 4C.3. Only customer master record is currently active under PostgreSQL.</p></div> : <><div className="cf-segments cf-reference-tabs" role="group" aria-label="Customer history">{['Invoices','Orders','Payments'].map(value=><Button key={value} variant="ghost" aria-pressed={tab===value} onClick={()=>setTab(value)}>{value}</Button>)}</div><p className="cf-muted">Supplied records only · {fy} · {agingAsOf()}</p>{tab==='Payments'?(payments.length?payments.map(({row,payment})=><div className="cf-detail-line" key={payment.id}><div><strong>{payment.remittance_number}</strong><small>{dateLabel(payment.payment_date)} · {row.invoice_number}</small><Button variant="ghost" onClick={()=>{close();openRecord(row,'invoice');}}>View invoice<ArrowUpRight size={14}/></Button></div><strong>{money(payment.payment_amount)} cash<small>{money(payment.tds_amount)} TDS</small></strong></div>):<EmptyState/>):((tab==='Invoices'?issued:orders).length?(tab==='Invoices'?issued:orders).map(row=><div className="cf-detail-line" key={row.id}><Button variant="ghost" onClick={()=>{close();openRecord(row,tab==='Invoices'?'invoice':'order');}}>{row.invoice_number??row.po_number}<ArrowUpRight size={14}/></Button><strong>{money(row.total_amount)}<small>{tab==='Invoices'?`${money(row.outstanding_balance)} receivable`:'Unbilled · not receivables'}</small></strong></div>):<EmptyState/>)}</>}<p className="cf-lock-note">Issued invoice billing identity is historical and is not rewritten when customer details change.</p></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function CustomerDirectory({container,empty=false,openRecord}: {container?:HTMLElement|null|undefined;empty?:boolean;openRecord:(row:Invoice,kind:'order'|'invoice')=>void}) {
 const {references,role}=useMockSession();
 const isLive = apiClient.getMode() === "live";
 const currentUser = apiClient.getCurrentUser();
 const effectiveRole = (isLive && currentUser?.role) ? currentUser.role : role;
 const [liveCustomers, setLiveCustomers] = useState<Customer[]>([]);
 const [liveLoading, setLiveLoading] = useState(false);
 const [liveError, setLiveError] = useState<string | null>(null);

 const fetchRequestId = useRef(0);
 const fetchLiveCustomers = () => {
   if (!isLive) return;
   const currentId = ++fetchRequestId.current;
   setLiveLoading(true);
   setLiveError(null);
   apiClient.getCustomers()
     .then(data => {
       if (currentId !== fetchRequestId.current) return;
       const mapped: Customer[] = data.map(c => ({
         id: c.id,
         billing_name: c.billing_name,
         billing_address: c.billing_address || "",
         city: c.city || "",
         state: c.state || "",
         country: c.country || "IN",
         pin_code: c.pin_code || "",
         gst_number: c.gst_number || "",
         phone_1: c.phone_1 || "",
         phone_2: c.phone_2 || "",
         contact_person: c.contact_person || "",
         designation: c.designation || "",
         email: c.email || "",
         is_active: c.is_active ? 1 : 0,
         total_orders: c.total_orders ?? 0,
         total_billed: Number(c.total_billed || 0),
       }));
       setLiveCustomers(mapped);
       setLiveLoading(false);
     })
     .catch(err => {
       if (currentId !== fetchRequestId.current) return;
       setLiveError(err.message || "Failed to load customers from backend");
       setLiveLoading(false);
     });
 };

 useEffect(() => {
   fetchLiveCustomers();
 }, [isLive]);

 const [query,setQuery]=useState(''),[region,setRegion]=useState('All states'),[sort,setSort]=useState('Name A–Z'),[page,setPage]=useState(1),[size,setSize]=useState('10'),[operation,setOperation]=useState<Operation|null>(null),[detail,setDetail]=useState<number|null>(null);
 const dataSource = isLive ? liveCustomers : references.customers;
 const rows=(empty?[]:dataSource).filter(row=>(region==='All states'||row.state===region)&&`${row.billing_name} ${row.gst_number??''} ${row.contact_person??''} ${row.email??''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='Name A–Z'?a.billing_name.localeCompare(b.billing_name):b.billing_name.localeCompare(a.billing_name));
 const pages=Math.max(1,Math.ceil(rows.length/Number(size))),current=Math.min(page,pages),visible=rows.slice((current-1)*Number(size),current*Number(size));
 const selected=dataSource.find(row=>row.id===detail);
 function act(action:ReferenceAction,customer?:Customer){setOperation({action,target:customer?String(customer.id):'',label:action==='customer-create'?'Create customer':action==='customer-edit'?'Edit customer':'Delete customer',values:action==='customer-delete'?{}:customerForm(customer),example:customer?editExample(customer):customerExample});}
 const actions=(row:Customer)=><div className="cf-reference-actions"><Button variant="ghost" size="icon" aria-label={`View ${row.billing_name}`} title="Customer details" onClick={()=>setDetail(row.id)}><ArrowUpRight size={17}/></Button>{referencePermitted(effectiveRole,'customer-edit')&&<><Button variant="ghost" size="icon" aria-label={`Edit ${row.billing_name}`} title="Edit customer" onClick={()=>act('customer-edit',row)}><Pencil size={16}/></Button><Button variant="ghost" size="icon" aria-label={`Delete ${row.billing_name}`} title="Delete customer" onClick={()=>act('customer-delete',row)}><Trash2 size={16}/></Button></>}</div>;
 return <section className="cf-reference-section"><header className="cf-section-header"><h2>Customer directory <span className="cf-count">{rows.length}</span></h2>{referencePermitted(effectiveRole,'customer-create')&&<Button onClick={()=>act('customer-create')}><Plus size={17}/>New customer</Button>}</header>{liveError&&<div className="cf-field-error" role="alert">{liveError}</div>}{liveLoading&&<p className="cf-muted" role="status">Loading live customer master…</p>}<div className="cf-reference-tools"><div className="cf-table-search"><Search size={18}/><Input aria-label="Search customers" maxLength={200} value={query} placeholder="Name, GSTIN or contact" onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div><FilterChoice label="Customer state" value={region} options={['All states',...Array.from(new Set(dataSource.map(row=>row.state||'Not supplied')))]} onChange={value=>{setRegion(value);setPage(1);}}/><FilterChoice label="Customer sort" value={sort} options={['Name A–Z','Name Z–A']} onChange={setSort}/></div>{!rows.length?<EmptyState onReset={()=>{setQuery('');setRegion('All states');}}/>:<><div className="cf-table-container"><table className="cf-table cf-customer-table"><thead><tr><th>Customer / GSTIN</th><th>Contact</th><th>State</th><th>Actions</th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td><Button variant="link" onClick={()=>setDetail(row.id)}>{row.billing_name}</Button><small>{row.gst_number||'No GSTIN supplied'}</small></td><td>{row.contact_person||'Not supplied'}<small>{row.email||'No email supplied'}</small><small>{row.phone_1||'No phone supplied'}</small></td><td>{row.state||'Not supplied'}</td><td>{actions(row)}</td></tr>)}</tbody></table></div><div className="cf-mobile-cards">{visible.map(row=><article className="cf-record-card" key={row.id}><h3>{row.billing_name}</h3><dl><div><dt>GSTIN</dt><dd>{row.gst_number||'Not supplied'}</dd></div><div><dt>State</dt><dd>{row.state||'Not supplied'}</dd></div><div><dt>Contact</dt><dd>{row.contact_person||'Not supplied'}</dd></div><div><dt>Email</dt><dd>{row.email||'Not supplied'}</dd></div></dl><footer>{actions(row)}</footer></article>)}</div><footer className="cf-table-footer"><span>{rows.length} customers · page {current} of {pages}</span><div><FilterChoice label="Customers per page" value={size} options={['1','10','25']} onChange={value=>{setSize(value);setPage(1);}}/><Button variant="ghost" size="icon" aria-label="Previous customer page" disabled={current===1} onClick={()=>setPage(current-1)}><ChevronLeft size={16}/></Button><Button variant="ghost" size="icon" aria-label="Next customer page" disabled={current===pages} onClick={()=>setPage(current+1)}><ChevronRight size={16}/></Button></div></footer></>}{operation&&<Workflow operation={operation} container={container} close={()=>setOperation(null)} onSuccess={fetchLiveCustomers} liveCustomers={liveCustomers}/>}{selected&&<CustomerDetails customer={selected} container={container} close={()=>setDetail(null)} openRecord={openRecord}/>}</section>;
}
export function FinancialReferences({container,empty=false}: {container?:HTMLElement|null|undefined;empty?:boolean}) {
 const {references,role}=useMockSession();
 const isLive = apiClient.getMode() === "live";
 const currentUser = apiClient.getCurrentUser();
 const effectiveRole = isLive ? (currentUser?.role ?? "viewer") : role;
 const writable = effectiveRole === 'admin' || effectiveRole === 'finance';
 const [tab,setTab]=useState('Financial years'),[query,setQuery]=useState(''),[status,setStatus]=useState('All rates'),[operation,setOperation]=useState<Operation|null>(null);
 const [liveFys, setLiveFys] = useState<{ code: string; start_date?: string; end_date?: string; is_active: boolean }[]>([]);
 const [liveGst, setLiveGst] = useState<{ id: number; name: string; rate: number; cgst_rate?: number; sgst_rate?: number; igst_rate?: number; is_default?: boolean; is_active: boolean }[]>([]);
 const [liveTds, setLiveTds] = useState<{ id: number; section_code: string; description?: string; rate: number; is_active: boolean }[]>([]);
 const [liveLoading, setLiveLoading] = useState(false);
 const [liveError, setLiveError] = useState<string | null>(null);

 const fetchLiveReferences = () => {
   if (!isLive) return;
   setLiveLoading(true);
   setLiveError(null);
   Promise.all([
     apiClient.getFinancialYears(),
     apiClient.getTaxes(),
   ])
     .then(([fys, taxes]) => {
       setLiveFys(fys || []);
       if (taxes) {
         setLiveGst(taxes.gst_rates || []);
         setLiveTds(taxes.tds_rates || []);
       }
       setLiveLoading(false);
     })
     .catch(err => {
       setLiveError(err.message || "Failed to load statutory references");
       setLiveLoading(false);
     });
 };

 useEffect(() => {
   fetchLiveReferences();
 }, [isLive]);

 function act(action:ReferenceAction,target='',label:string,example:ReferenceInput={}){setOperation({action,target,label,values:Object.fromEntries(Object.keys(example).map(key=>[key,key==='tax_type'?'GST':key==='is_default'?'0':''])),example});}
 const years=empty?[]:(isLive
   ? liveFys.filter(row=>row.code.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.code.localeCompare(a.code)).map(row=>({code:row.code,start_date:row.start_date||'',end_date:row.end_date||'',is_active:row.is_active?1:0}))
   : references.years.filter(row=>row.code.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.code.localeCompare(a.code)));
 const rates=empty?[]:(isLive
   ? (tab==='GST'
       ? liveGst.map(row=>({id:row.id,name:row.name,description:'GST',rate:row.rate,is_active:row.is_active?1:0,default:Boolean(row.is_default)}))
       : liveTds.map(row=>({id:row.id,name:row.section_code,description:row.description||'',rate:row.rate,is_active:row.is_active?1:0,default:false}))
     ).filter(row=>`${row.name} ${row.description}`.toLowerCase().includes(query.toLowerCase())&&(status==='All rates'||(status==='Active'?row.is_active===1:row.is_active===0)))
   : (tab==='GST'?references.gst.map(row=>({id:row.id,name:row.name,description:row.tax_type,rate:row.rate,is_active:row.is_active,default:row.is_default===1})):references.tds.map(row=>({id:row.id,name:row.section_code,description:row.description,rate:row.rate,is_active:row.is_active,default:false}))).filter(row=>`${row.name} ${row.description}`.toLowerCase().includes(query.toLowerCase())&&(status==='All rates'||(status==='Active'?row.is_active===1:row.is_active===0))));
 return <section className="cf-reference-section"><div className="cf-segments cf-reference-tabs" role="group" aria-label="Financial reference tabs">{['Financial years','GST','TDS'].map(value=><Button key={value} variant="ghost" aria-pressed={tab===value} onClick={()=>{setTab(value);setQuery('');}}>{value}</Button>)}</div><header className="cf-section-header"><h2>{tab}</h2>{writable&&<div className="cf-reference-actions">{tab==='Financial years'&&(!isLive ? <Button variant="outline" onClick={()=>act('fy-seed','','Seed standard years')}><RotateCcw size={16}/>Seed years</Button> : <Button variant="outline" disabled title="Financial year seeding is not supported in live mode"><RotateCcw size={16}/>Seed years</Button>)}<Button onClick={()=>act(tab==='Financial years'?'fy-create':tab==='GST'?'gst-create':'tds-create','',tab==='Financial years'?'Add financial year':`Add ${tab} rate`,tab==='Financial years'?fyExample:tab==='GST'?gstExample:tdsExample)}><Plus size={16}/>Add {tab==='Financial years'?'year':'rate'}</Button></div>}</header>{liveError&&<div className="cf-field-error" role="alert">{liveError}</div>}{liveLoading&&<p className="cf-muted" role="status">Loading live statutory references…</p>}<div className="cf-reference-tools"><div className="cf-table-search"><Search size={17}/><Input aria-label="Search references" maxLength={200} value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Search ${tab.toLowerCase()}`}/></div>{tab!=='Financial years'&&<FilterChoice label="Rate status" value={status} options={['All rates','Active','Inactive']} onChange={setStatus}/>}</div><p className="cf-muted">{tab==='Financial years'?'Financial-year editing is unavailable in the source API. Deletion requires no linked documents.':isLive?'Rates can be added in live mode. Rate deactivation and modification are scheduled for later stages.':'Rates can be added or deactivated, not edited or reactivated. Inactive entries are retained in this demo only; the source list returns active rates.'}</p>
 {tab==='Financial years'?(!years.length?<EmptyState/>:<div className="cf-reference-list">{years.map(year=><div className="cf-reference-row" key={year.code}><div><strong>{year.code}</strong><small>{dateLabel(year.start_date)} – {dateLabel(year.end_date)}</small></div><span className="cf-status">{year.is_active?'Active':'Inactive'}</span>{writable&&<Button variant="ghost" size="icon" title="Delete unused financial year" aria-label={`Delete ${year.code}`} onClick={()=>act('fy-delete',year.code,'Delete financial year')}><Trash2 size={16}/></Button>}</div>)}</div>):(!rates.length?<EmptyState/>:<div className="cf-reference-list">{rates.map(rate=><div className="cf-reference-row" key={rate.id}><div><strong>{rate.name}</strong><small>{rate.description}{rate.default?' · Default':''}</small></div><strong className="cf-number">{Number((rate.rate*100).toFixed(3))}%</strong><span className={`cf-status ${rate.is_active?'paid':''}`}>{rate.is_active?'Active':'Inactive'}</span>{writable&&(!isLive ? <Button variant="ghost" size="icon" disabled={!rate.is_active} title="Deactivate rate" aria-label={`Deactivate ${rate.name}`} onClick={()=>act(tab==='GST'?'gst-deactivate':'tds-deactivate',String(rate.id),`Deactivate ${tab} rate`)}><Trash2 size={16}/></Button> : <Button variant="ghost" size="icon" disabled title="Rate deactivation is not supported in live mode" aria-label={`Deactivate ${rate.name}`}><Trash2 size={16}/></Button>)}</div>)}</div>)}{operation&&<Workflow operation={operation} container={container} close={()=>setOperation(null)} onSuccess={fetchLiveReferences}/>}</section>;
}