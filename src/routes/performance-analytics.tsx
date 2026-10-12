import { apiClient } from "@/lib/api-client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Workspace } from "@/components/collectflow/workspace";

export const Route = createFileRoute("/performance-analytics")({
  ssr: false,
  beforeLoad: () => {
    if (apiClient.getMode() === "live" && !apiClient.getToken()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "CollectFlow — Performance Analytics" },
      {
        name: "description",
        content:
          "Target attainment, sub-period breakdown, and executive leaderboard analytics.",
      },
      { property: "og:title", content: "CollectFlow — Performance Analytics" },
      {
        property: "og:description",
        content:
          "Target attainment, sub-period breakdown, and executive leaderboard analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return <Workspace initial="Performance Analytics" />;
}
