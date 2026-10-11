import { createFileRoute } from '@tanstack/react-router';
import { Workspace } from '@/components/collectflow/workspace';

export const Route = createFileRoute('/users')({
  head: () => ({
    meta: [
      { title: 'CollectFlow — Users & Roles' },
      {
        name: 'description',
        content: 'User management, access control and role-based permissions.',
      },
      { property: 'og:title', content: 'CollectFlow — Users & Roles' },
      {
        property: 'og:description',
        content: 'User management, access control and role-based permissions.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Page,
});

function Page() {
  return <Workspace initial="Users & Roles" />;
}
