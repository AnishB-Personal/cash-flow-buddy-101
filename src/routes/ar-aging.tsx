import { apiClient } from "@/lib/api-client";
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Workspace } from '@/components/collectflow/workspace';
export const Route = createFileRoute('/ar-aging')({
  ssr: false,
  beforeLoad: () => {
    if (apiClient.getMode() === "live" && !apiClient.getToken()) {
      throw redirect({ to: "/login" });
    }
  },head:()=>({meta:[{title:'CollectFlow — AR Aging'},{name:'description',content:'Issued receivables by aging category, excluding unbilled orders.'},{property:'og:title',content:'CollectFlow — AR Aging'},{property:'og:description',content:'Issued receivables by aging category, excluding unbilled orders.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:Page});
function Page() {return <Workspace initial="AR Aging"/>;}
