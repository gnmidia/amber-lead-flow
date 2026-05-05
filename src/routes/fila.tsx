import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/fila")({
  component: () => <ModulePlaceholder title="Fila" subtitle="Fila de envios" />,
});
