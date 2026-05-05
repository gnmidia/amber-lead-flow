import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/publico")({
  component: () => <ModulePlaceholder title="Público" subtitle="Análise de público" />,
});
