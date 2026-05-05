import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/transacoes")({
  component: () => (
    <ModulePlaceholder title="Transações" subtitle="Histórico financeiro" />
  ),
});
