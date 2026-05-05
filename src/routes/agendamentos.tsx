import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/agendamentos")({
  component: () => (
    <ModulePlaceholder title="Agendamentos" subtitle="Mensagens programadas" />
  ),
});
