import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/collectflow/login-page";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CollectFlow — Live Authentication" },
      { name: "description", content: "Authenticate into CollectFlow integration sandbox." },
    ],
  }),
  component: LoginPage,
});

