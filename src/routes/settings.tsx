import { apiClient } from "@/lib/api-client";
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Workspace } from '@/components/collectflow/workspace';
export const Route = createFileRoute('/settings')({
  ssr: false,
  beforeLoad: () => {
    if (apiClient.getMode() === "live" && !apiClient.getToken()) {
      throw redirect({ to: "/login" });
    }
  },head:()=>({meta:[{title:'CollectFlow — Financial References'},{name:'description',content:'Financial years and GST/TDS reference management with guarded demo changes.'},{property:'og:title',content:'CollectFlow — Financial References'},{property:'og:description',content:'Financial years and GST/TDS reference management with guarded demo changes.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:Page});
function Page(){return <Workspace initial="Settings"/>;}