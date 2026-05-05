import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/inteligencia-ia")({
  component: () => (
    <ModulePlaceholder title="Inteligência IA" subtitle="Insights gerados por IA" />
  ),
});
