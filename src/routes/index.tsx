import { createFileRoute } from "@tanstack/react-router";
import { Comparison } from '@/components/collectflow/comparison';

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: 'CollectFlow — Design Comparison' },
    { name: 'description', content: 'Compare three interactive CollectFlow financial workspaces using sanitized mock data.' },
    { property: 'og:title', content: 'CollectFlow — Design Comparison' },
    { property: 'og:description', content: 'Precision Enterprise, Calm Modern SaaS, and Premium Analytics.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return <Comparison />;
}
