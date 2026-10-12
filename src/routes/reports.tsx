import { apiClient } from "@/lib/api-client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Workspace } from "@/components/collectflow/workspace";

export const Route = createFileRoute("/reports")({
  ssr: false,
  beforeLoad: () => {
    if (apiClient.getMode() === "live" && !apiClient.getToken()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "CollectFlow — Financial Reports" },
      {
        name: "description",
        content:
          "Financial reconciliation, receivables reports, collections ledger, customer exposure, executive quota attainment, and AR aging.",
      },
      { property: "og:title", content: "CollectFlow — Financial Reports" },
      {
        property: "og:description",
        content:
          "Financial reconciliation, receivables reports, collections ledger, customer exposure, executive quota attainment, and AR aging.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return <Workspace initial="Reports" />;
}
