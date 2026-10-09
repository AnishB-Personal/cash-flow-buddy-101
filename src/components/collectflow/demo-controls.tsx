import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search, X, RotateCcw, ClipboardCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { data, money, type Invoice } from '@/data/collectflow';
import { agingAsOf } from '@/data/records';
import { permits } from '@/data/demo-policy';
import { contracts, contractGaps } from '@/data/demo-contracts';
import { scenarios, scenarioById, demoInputSchema, reviewDemo, type DemoInput, type DemoFormInput, type DemoReview, type DemoResult, type ScenarioId } from '@/data/demo';
import { useMockSession } from './session';

export function FormSection({ title, children }: { title: string; children: ReactNode }) { return <section className="cf-form-section"><h3>{title}</h3>{children}</section>; }
export function FieldError({ id, message }: { id: string; message: string | undefined }) { return message ? <p id={id} className="cf-field-error" role="alert">{message}</p> : null; }
export function ReferencePicker({ records, value, onChange }: { records: Invoice[]; value: number; onChange: (id: number) => void }) {
 const [query,setQuery] = useState('');
 const matches = records.filter(row=>`${row.po_number} ${row.invoice_number??''} ${row.customer_name}`.toLowerCase().includes(query.toLowerCase()));
 return <div className="cf-reference-picker"><div className="cf-table-search"><Search size={17}/><Input aria-label="Search document references" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search PO, invoice or customer"/></div><div role="group" aria-label="Document references">{matches.map(row=><Button type="button" variant="outline" key={row.id} aria-pressed={value===row.id} onClick={()=>onChange(row.id)}><span><strong>{row.invoice_number??row.po_number}</strong><small>{row.customer_name}</small></span>{value===row.id&&<CheckCircle2 size={18}/>}</Button>)}{!matches.length&&<p role="status">No matching documents in this financial year.</p>}</div></div>;
}
export function FinancialReview({ review }: { review: DemoReview }) {
 const before = review.before.invoices.find(row=>row.id===review.input.documentId);
 const after = review.after?.invoices.find(row=>row.id===review.input.documentId);
 if (!before) return null;
 return <><FormSection title="Intended change"><dl className="cf-detail-grid"><div><dt>Document</dt><dd>{before.invoice_number??before.po_number}</dd></div><div><dt>Customer</dt><dd>{before.customer_name}</dd></div><div><dt>Before · remarks</dt><dd>{before.remarks}</dd></div><div><dt>Requested · remarks</dt><dd>{review.input.remarks}</dd></div></dl></FormSection><FormSection title="Financial review"><dl className="cf-review-values">{[['Document value',before.total_amount],['Cash collected',before.total_cash_paid],['TDS recognized',before.total_tds_deducted],['Total settlement',before.total_paid],['Outstanding',before.outstanding_balance]].map(([label,amount])=><div key={label}><dt>{label}</dt><dd>{money(Number(amount))}<small>Unchanged</small></dd></div>)}</dl><p className="cf-muted">{agingAsOf()} · {before.fy_code}</p><p className="cf-muted">{after?'Only the supplied remarks change in the isolated snapshot.':'No verified after-snapshot will be applied.'}</p></FormSection><p className="cf-drawer-message" role="status">{review.message}</p></>;
}
function ContractRegister() {return <><FormSection title="Verified API register">{contracts.map(item=><section className="cf-contract-item" key={item.area}><h3>{item.area}</h3><p>{item.reads}</p><p>{item.writes}</p><p className="cf-muted">{item.boundary}</p></section>)}</FormSection><FormSection title="Contract gaps and stage gates"><ul className="cf-contract-gaps">{contractGaps.map(gap=><li key={gap}>{gap}</li>)}</ul></FormSection><FormSection title="Scenario catalogue">{scenarios.filter(item=>item.id!=='baseline').map(item=><div className="cf-contract-item" key={item.id}><h3>{item.label}</h3><p>{item.result==='verified'?'Verified metadata-only result; no financial amounts change.':item.result==='blocked'?'Verified rejection: invoice has an active payment.':'Review only; no verified change applied.'}</p></div>)}</FormSection></>;}

function DemoSequence({ close }: { close: () => void }) {
 const {role,fy,scenario,confirmDemo} = useMockSession();
 const selected = scenarioById(scenario);
 const [step,setStep] = useState<'form'|'review'|'confirm'|'result'>('form');
 const [review,setReview] = useState<DemoReview|null>(null);
 const [result,setResult] = useState<DemoResult|null>(null);
 const [error,setError] = useState<string|null>(null);
 const [pending,setPending] = useState(false);
 const [discard,setDiscard] = useState(false);
 const submitting = useRef(false);
 const form = useForm<DemoFormInput, unknown, DemoInput>({resolver:zodResolver(demoInputSchema),defaultValues:{documentId:selected.documentId,remarks:selected.remarks,asOfDate:'2026-04-30'}});
 const dirty = form.formState.isDirty;
 const allowed = permits(role,selected.action) && scenario!=='baseline';
 const records = data.invoices.filter(row=>row.fy_code===fy);
 function requestClose() {if(dirty&&step!=='result') setDiscard(true);else close();}
 useEffect(()=>{function escape(event: KeyboardEvent){if(event.key==='Escape'&&!pending){event.preventDefault();requestClose();}}document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);});
 function prepare(input: DemoInput) { try {setReview(reviewDemo(scenario,input,role,fy));setError(null);setStep('review');} catch(error) {setError(error instanceof Error?error.message:'Review unavailable.');} }
 async function submit() {
  if(!review||submitting.current) return;
  submitting.current=true;setPending(true);setError(null);
  try {setResult(await confirmDemo(review));setStep('result');}
  catch {setError('Demo submission failed. No changes applied. Please try again.');}
  finally {submitting.current=false;setPending(false);}
 }
 return <div className="cf-demo-sequence"><div className="cf-demo-progress" aria-label="Review sequence">{['Form','Review','Confirm','Result'].map(label=><span key={label} aria-current={step===label.toLowerCase()?'step':undefined}>{label}</span>)}</div>
 {!allowed?<p role="alert" className="cf-drawer-message">{scenario==='baseline'?'Select a rehearsal scenario to begin.':'This role cannot perform this action. Records remain unchanged.'}</p>:step==='form'?<form onSubmit={form.handleSubmit(prepare)}><FormSection title="Document reference"><ReferencePicker records={records} value={form.watch('documentId')} onChange={id=>form.setValue('documentId',id,{shouldDirty:true,shouldValidate:true})}/><FieldError id="document-error" message={form.formState.errors.documentId?.message}/></FormSection><FormSection title={selected.action==='cancel'?'Cancellation review note':'Metadata rehearsal'}><label htmlFor="demo-remarks">Remarks</label><Textarea id="demo-remarks" aria-describedby="remarks-error" aria-invalid={Boolean(form.formState.errors.remarks)} {...form.register('remarks')}/><FieldError id="remarks-error" message={form.formState.errors.remarks?.message}/><label htmlFor="demo-date">Reporting date</label><Input id="demo-date" type="date" readOnly {...form.register('asOfDate')}/><FieldError id="date-error" message={form.formState.errors.asOfDate?.message}/></FormSection><div className="cf-demo-actions"><Button type="submit">Review intended changes<ArrowRight size={16}/></Button></div></form>:step==='result'&&result?<><FormSection title={result.status==='success'?'Demo result':'No changes applied'}><p role="status">{result.message}</p><p className="cf-muted">{agingAsOf()} · all original financial totals preserved.</p></FormSection><Button variant="outline" onClick={close}>Return to workspace</Button></>:review?<><FinancialReview review={review}/>{step==='confirm'&&<p className="cf-drawer-message">Confirm this metadata-only demo change? Actual records and financial amounts will not change.</p>}<div className="cf-demo-actions"><Button variant="outline" disabled={pending} onClick={()=>setStep('form')}>Back to form</Button>{review.supported&&<Button disabled={pending||!permits(role,selected.action)} onClick={()=>{if(step==='review')setStep('confirm');else void submit();}}>{pending?'Submitting…':step==='review'?'Continue to confirmation':'Confirm demo change'}<ClipboardCheck size={16}/></Button>}</div></>:null}
 {error&&<p role="alert" className="cf-field-error">{error}</p>}
 {discard?<div className="cf-discard"><p>Discard unsaved demo inputs?</p><Button variant="outline" onClick={()=>setDiscard(false)}>Keep editing</Button><Button onClick={close}>Discard inputs</Button></div>:<Button variant="ghost" disabled={pending} onClick={requestClose}>Close rehearsal</Button>}
 </div>;
}

export function DemoControls({ container }: { container?: HTMLElement | null | undefined }) {
 const {scenario,selectScenario,resetDemo} = useMockSession();
 const [open,setOpen] = useState(false);
 const [view,setView] = useState<'rehearsal'|'contracts'>('rehearsal');
 const [reset,setReset] = useState(false);
 const trigger = useRef<HTMLButtonElement|null>(null);
 return <><section className="cf-demo-bar" aria-label="Demo controls"><div><strong>Demo Mode — No actual financial records are modified</strong><small>{scenarioById(scenario).label} · {agingAsOf()}</small></div><div className="cf-demo-bar-actions"><label className="sr-only" htmlFor="demo-scenario">Demo scenario</label><select id="demo-scenario" aria-label="Demo scenario" value={scenario} onChange={event=>selectScenario(event.target.value as ScenarioId)}>{scenarios.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select><Button variant="outline" onClick={event=>{trigger.current=event.currentTarget;setView('rehearsal');setOpen(true);}}><ClipboardCheck size={16}/>Review scenario</Button><Button variant="ghost" onClick={event=>{trigger.current=event.currentTarget;setView('contracts');setOpen(true);}}>Contracts & gaps</Button><Button variant="ghost" title="Reset Demo" onClick={()=>setReset(true)}><RotateCcw size={16}/>Reset Demo</Button></div></section>
 {reset&&<div className="cf-demo-reset" role="alert"><span>Restore the approved baseline, original totals and 30 April 2026 reporting date?</span><Button variant="outline" onClick={()=>setReset(false)}>Keep scenario</Button><Button onClick={()=>{resetDemo();setReset(false);}}>Restore baseline</Button></div>}
 <Dialog.Root open={open} onOpenChange={value=>{if(value)setOpen(true);}}><Dialog.Portal container={container}><Dialog.Overlay className="cf-overlay"/><Dialog.Content className="cf-app cf-drawer cf-demo-drawer" onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus();}} onEscapeKeyDown={event=>{if(view==='rehearsal')event.preventDefault();else setOpen(false);}} onInteractOutside={event=>event.preventDefault()}><header className="cf-drawer-header"><div><Dialog.Title>{view==='contracts'?'Contracts & scenario catalogue':'Demo rehearsal'}</Dialog.Title><Dialog.Description>Stage 0 · isolated mock workspace</Dialog.Description></div>{view==='contracts'&&<Button variant="ghost" size="icon" aria-label="Close contract register" onClick={()=>setOpen(false)}><X/></Button>}</header><div className="cf-drawer-body">{view==='contracts'?<ContractRegister/>:<DemoSequence key={scenario} close={()=>setOpen(false)}/>}</div></Dialog.Content></Dialog.Portal></Dialog.Root>
 </>;
}