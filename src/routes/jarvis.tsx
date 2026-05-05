import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/jarvis")({
  component: () => (
    <ModulePlaceholder title="Jarvis" subtitle="Assistente IA do operador" />
  ),
});
