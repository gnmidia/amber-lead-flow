import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/tarefas")({
  component: () => <ModulePlaceholder title="Tarefas" subtitle="Tarefas operacionais" />,
});
