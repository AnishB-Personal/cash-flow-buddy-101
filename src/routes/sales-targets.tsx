import { apiClient } from "@/lib/api-client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Workspace } from "@/components/collectflow/workspace";

export const Route = createFileRoute("/sales-targets")({
  ssr: false,
  beforeLoad: () => {
    if (apiClient.getMode() === "live" && !apiClient.getToken()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "CollectFlow — Sales Targets" },
      {
        name: "description",
        content:
          "Annual, half-yearly, quarterly and monthly sales targets and executive attainment.",
      },
      { property: "og:title", content: "CollectFlow — Sales Targets" },
      {
        property: "og:description",
        content:
          "Annual, half-yearly, quarterly and monthly sales targets and executive attainment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return <Workspace initial="Sales Targets" />;
}
