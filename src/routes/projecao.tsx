import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/projecao")({
  component: () => (
    <ModulePlaceholder title="Projeção" subtitle="Projeção de faturamento e metas" />
  ),
});
