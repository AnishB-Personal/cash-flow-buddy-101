import { apiClient } from "@/lib/api-client";
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Workspace } from '@/components/collectflow/workspace';
export const Route = createFileRoute('/orders')({
  ssr: false,
  beforeLoad: async () => {
    if (apiClient.getMode() === "live") {
      const user = await apiClient.ensureAuthenticated();
      if (!user) {
        throw redirect({ to: "/login" });
      }
    }
  },head:()=>({meta:[{title:'CollectFlow — Orders'},{name:'description',content:'Purchase orders, order values and billing readiness.'},{property:'og:title',content:'CollectFlow — Orders'},{property:'og:description',content:'Purchase orders, order values and billing readiness.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:Page});
function Page() {return <Workspace initial="Orders"/>;}
