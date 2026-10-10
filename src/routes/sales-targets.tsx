import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/collectflow/workspace";

export const Route = createFileRoute("/sales-targets")({
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
