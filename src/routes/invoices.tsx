import { createFileRoute } from '@tanstack/react-router';
import { Workspace } from '@/components/collectflow/workspace';
export const Route = createFileRoute('/invoices')({head:()=>({meta:[{title:'CollectFlow — Invoices'},{name:'description',content:'Issued invoice totals, outstanding balances and payment history.'},{property:'og:title',content:'CollectFlow — Invoices'},{property:'og:description',content:'Issued invoice totals, outstanding balances and payment history.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:Page});
function Page() {return <Workspace initial="Invoices"/>;}
