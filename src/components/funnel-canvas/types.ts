// Tipos do builder de funil 2D (tabelas funnel_blocks/actions/edges/ab_outputs).

export type ActionType =
  | "texto"
  | "audio"
  | "imagem"
  | "video"
  | "documento"
  | "delay"
  | "tag";

export type ActionConfig = {
  // texto
  content?: string;
  // mídia (audio/imagem/video/documento)
  media_url?: string | null;
  file_name?: string | null;
  mimetype?: string | null;
  caption?: string | null;
  // tag
  tag_id?: string | null;
  tag_operation?: "assign" | "remove" | null;
  // delay — AÇÃO isolada; espera real antes da próxima ação
  value?: number;
  unit?: "seconds" | "minutes" | "hours";
};

export type FunnelBlockRow = {
  id: string;
  funnel_id: string;
  operation_id: string;
  title: string | null;
  node_type: "block" | "ab_split";
  position_x: number;
  position_y: number;
};

export type FunnelActionRow = {
  id: string;
  block_id: string;
  operation_id: string;
  type: ActionType;
  order_index: number;
  config: ActionConfig;
};

export type FunnelEdgeRow = {
  id: string;
  funnel_id: string;
  operation_id: string;
  source_block_id: string;
  source_handle: string | null;
  target_block_id: string;
};

export type AbOutputRow = {
  id: string;
  block_id: string;
  operation_id: string;
  output_index: number;
  weight: number;
};

export const ACTION_LABEL: Record<ActionType, string> = {
  texto: "Texto",
  audio: "Áudio",
  imagem: "Imagem",
  video: "Vídeo",
  documento: "Documento",
  delay: "Delay",
  tag: "Tag",
};

export const PALETTE: ActionType[] = [
  "texto",
  "audio",
  "imagem",
  "video",
  "documento",
  "tag",
  "delay",
];

export const DND_MIME = "application/x-funnel-action";
