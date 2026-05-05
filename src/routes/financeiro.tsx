import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/financeiro")({
  component: () => (
    <ModulePlaceholder title="Financeiro" subtitle="Visão financeira consolidada" />
  ),
});
