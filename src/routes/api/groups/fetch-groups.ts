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

        // TODO debug — remover depois do diagnóstico
        console.log("[fetch-groups] config", {
          hasBaseUrl: !!baseUrl,
          baseUrl: baseUrl || "(vazio)",
          hasInstance: !!instance,
          instance: instance || "(vazio)",
          hasApiKey: !!apiKey,
          apiKeyPrefix: apiKey ? `${apiKey.slice(0, 4)}...` : "(vazio)",
        });

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
            const infoUrl = `${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`;
            const infoRes = await fetch(infoUrl, { headers: { apikey: apiKey } });
            const infoRaw = await infoRes.text();
            // TODO debug
            console.log("[fetch-groups] fetchInstances", {
              url: infoUrl,
              status: infoRes.status,
              ok: infoRes.ok,
              bodyPreview: infoRaw.slice(0, 500),
            });
            let infoJson: unknown = null;
            try {
              infoJson = JSON.parse(infoRaw);
            } catch {
              infoJson = null;
            }
            const arr = Array.isArray(infoJson) ? infoJson : [infoJson];
            for (const it of arr as Array<Record<string, any> | null>) {
              if (!it) continue;
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
            // TODO debug
            console.log("[fetch-groups] myNumber", myNumber || "(não resolvido)");
          } catch (e) {
            console.log("[fetch-groups] fetchInstances erro", String(e));
          }

          const url = `${baseUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=true`;
          const res = await fetch(url, { headers: { apikey: apiKey } });
          const rawText = await res.text();
          // TODO debug
          console.log("[fetch-groups] fetchAllGroups", {
            url,
            status: res.status,
            ok: res.ok,
            bodyPreview: rawText.slice(0, 500),
          });

          if (!res.ok) {
            return Response.json(
              {
                error: "Falha ao buscar grupos na Evolution API",
                status: res.status,
                detail: rawText.slice(0, 300),
              },
              { status: 502, headers: CORS },
            );
          }

          let raw: EvoGroup[] | { groups?: EvoGroup[] } = [];
          try {
            raw = JSON.parse(rawText);
          } catch {
            raw = [];
          }
          const list: EvoGroup[] = Array.isArray(raw) ? raw : (raw?.groups ?? []);
          // TODO debug
          console.log("[fetch-groups] total bruto", list.length);

          const mapped = list.map((g) => {
            const participants = g.participants ?? [];
            const admins = participants.filter(
              (p) => p.admin === "admin" || p.admin === "superadmin",
            );
            const isCommunityLike = !!g.isCommunity || !!g.isCommunityAnnounce;
            let iAmAdmin: boolean;
            let reason: "community" | "admin" | "fallback";
            if (isCommunityLike) {
              iAmAdmin = true;
              reason = "community";
            } else if (myNumber) {
              iAmAdmin = admins.some((p) => digits(p.id) === myNumber);
              reason = "admin";
            } else {
              iAmAdmin = true;
              reason = "fallback";
            }
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
              _reason: reason,
            };
          });

          const kept = mapped.filter((g) => g._iAmAdmin);
          // TODO debug
          console.log("[fetch-groups] filtro", {
            total: mapped.length,
            kept: kept.length,
            byReason: {
              community: kept.filter((g) => g._reason === "community").length,
              admin: kept.filter((g) => g._reason === "admin").length,
              fallback: kept.filter((g) => g._reason === "fallback").length,
            },
          });

          const filtered = kept.map(({ _iAmAdmin, _reason, ...rest }) => rest);

          return Response.json(
            {
              groups: filtered,
              total: filtered.length,
              lastUpdated: new Date().toISOString(),
            },
            { headers: { ...CORS, "Content-Type": "application/json" } },
          );
        } catch (err) {
          console.log("[fetch-groups] erro geral", String(err));
          return Response.json(
            { error: "Erro ao consultar Evolution API", detail: String(err) },
            { status: 502, headers: CORS },
          );
        }
      },
    },
  },
});
