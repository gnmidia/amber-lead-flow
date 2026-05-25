import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type Participant = {
  id: string;
  admin?: string | null; // "admin" | "superadmin" | null
};

type EvoGroup = {
  id: string;
  subject?: string;
  subjectOwner?: string;
  subjectTime?: number;
  creation?: number;
  desc?: string;
  descId?: string;
  size?: number;
  pictureUrl?: string | null;
  participants?: Participant[];
  isCommunity?: boolean;
  isCommunityAnnounce?: boolean;
  announce?: boolean;
};

function digits(s: string | undefined | null): string {
  if (!s) return "";
  return String(s).split("@")[0].replace(/\D/g, "");
}

export const Route = createFileRoute("/api/groups/fetch-groups")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const baseUrl = process.env.EVOLUTION_BASE_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const instance = process.env.EVOLUTION_INSTANCE_NAME;

        if (!baseUrl || !apiKey || !instance) {
          return Response.json(
            { error: "Evolution API não configurada" },
            { status: 500, headers: CORS },
          );
        }

        try {
          // Descobre o número da instância para identificar onde sou admin
          let myNumber = "";
          try {
            const infoRes = await fetch(
              `${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`,
              { headers: { apikey: apiKey } },
            );
            const infoJson = await infoRes.json().catch(() => null);
            const arr = Array.isArray(infoJson) ? infoJson : [infoJson];
            for (const it of arr) {
              const owner =
                it?.instance?.owner ??
                it?.owner ??
                it?.instance?.profileName ??
                it?.ownerJid ??
                it?.instance?.wuid;
              const n = digits(owner);
              if (n) {
                myNumber = n;
                break;
              }
            }
          } catch {
            // segue sem filtro de admin se não conseguir
          }

          const url = `${baseUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=true`;
          const res = await fetch(url, { headers: { apikey: apiKey } });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            return Response.json(
              {
                error: "Falha ao buscar grupos na Evolution API",
                status: res.status,
                detail: txt.slice(0, 300),
              },
              { status: 502, headers: CORS },
            );
          }
          const raw = (await res.json().catch(() => [])) as EvoGroup[] | { groups?: EvoGroup[] };
          const list: EvoGroup[] = Array.isArray(raw) ? raw : (raw?.groups ?? []);

          const mapped = list.map((g) => {
            const participants = g.participants ?? [];
            const admins = participants.filter(
              (p) => p.admin === "admin" || p.admin === "superadmin",
            );
            const iAmAdmin = myNumber
              ? admins.some((p) => digits(p.id) === myNumber)
              : true; // sem número conhecido: não filtra
            return {
              id: g.id,
              name: g.subject ?? "(sem nome)",
              description: g.desc ?? "",
              totalParticipants: g.size ?? participants.length ?? 0,
              admins: admins.length,
              subject: g.subject ?? "",
              subjectOwner: g.subjectOwner ?? "",
              creation: g.creation ?? 0,
              pictureUrl: g.pictureUrl ?? null,
              isCommunity: !!g.isCommunity,
              isCommunityAnnounce: !!g.isCommunityAnnounce,
              participants: participants.map((p) => ({
                id: p.id,
                phone: digits(p.id),
                admin: p.admin ?? null,
              })),
              _iAmAdmin: iAmAdmin,
            };
          });

          const filtered = mapped
            .filter((g) => g._iAmAdmin)
            .map(({ _iAmAdmin, ...rest }) => rest);

          return Response.json(
            {
              groups: filtered,
              total: filtered.length,
              lastUpdated: new Date().toISOString(),
            },
            { headers: { ...CORS, "Content-Type": "application/json" } },
          );
        } catch (err) {
          return Response.json(
            { error: "Erro ao consultar Evolution API", detail: String(err) },
            { status: 502, headers: CORS },
          );
        }
      },
    },
  },
});
