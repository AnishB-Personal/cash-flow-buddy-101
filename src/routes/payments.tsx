import { apiClient } from "@/lib/api-client";
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Workspace } from '@/components/collectflow/workspace';

export const Route = createFileRoute('/payments')({
  ssr: false,
  beforeLoad: async () => {
    if (apiClient.getMode() === "live") {
      const user = await apiClient.ensureAuthenticated();
      if (!user) {
        throw redirect({ to: "/login" });
      }
    }
  },
  head: () => ({
    meta: [
      { title: 'CollectFlow — Payments' },
      { name: 'description', content: 'Payment records, cash/TDS breakdown, remittance details and payments ledger.' },
      { property: 'og:title', content: 'CollectFlow — Payments' },
      { property: 'og:description', content: 'Payment records, cash/TDS breakdown, remittance details and payments ledger.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Page,
});

function Page() {
  return <Workspace initial="Payments" />;
}
