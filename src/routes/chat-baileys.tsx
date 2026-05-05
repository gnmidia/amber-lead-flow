import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/chat-baileys")({
  component: () => (
    <ModulePlaceholder title="Chat Baileys" subtitle="Conexão técnica Evolution / Baileys" />
  ),
});
