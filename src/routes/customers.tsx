import { createFileRoute, redirect } from "@tanstack/react-router";
import { apiClient } from "@/lib/api-client";
import { Workspace } from "@/components/collectflow/workspace";

export const Route = createFileRoute("/customers")({
  beforeLoad: () => {
    if (apiClient.getMode() === "live" && !apiClient.getToken()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "CollectFlow — Customers" },
      {
        name: "description",
        content: "Customer directory, billing references and supplied transaction history.",
      },
      { property: "og:title", content: "CollectFlow — Customers" },
      {
        property: "og:description",
        content: "Customer directory, billing references and supplied transaction history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return <Workspace initial="Customers" />;
}
