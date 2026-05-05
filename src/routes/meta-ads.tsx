import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "../components/ModulePlaceholder";

export const Route = createFileRoute("/meta-ads")({
  component: () => (
    <ModulePlaceholder
      title="Meta Ads"
      subtitle="Visualização das métricas da Meta Marketing API"
      description="Painel somente leitura: gasto, CPM, CTR, CPC, CPL, ROI e custo por lead real (cruzamento com banco interno)."
    />
  ),
});
