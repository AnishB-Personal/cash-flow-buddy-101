import { createFileRoute, redirect } from "@tanstack/react-router";
import { apiClient } from "@/lib/api-client";
import { Workspace } from "@/components/collectflow/workspace";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (apiClient.getMode() === "live" && !apiClient.getToken()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "CollectFlow — Financial Workspace" },
      {
        name: "description",
        content: "Manage orders, issued invoices and receivables in the CollectFlow workspace.",
      },
      { property: "og:title", content: "CollectFlow — Financial Workspace" },
      {
        property: "og:description",
        content: "A clear view of orders, invoices, cash, TDS and settlement performance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <Workspace />;
}
