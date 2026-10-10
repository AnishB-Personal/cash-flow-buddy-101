import { createFileRoute } from '@tanstack/react-router';
import { Workspace } from '@/components/collectflow/workspace';

export const Route = createFileRoute('/payments')({
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
