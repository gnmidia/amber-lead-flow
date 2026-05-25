import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type Participant = {
  id: string;
  admin?: string | null;
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

        // Descobre o número da instância (best-effort, não bloqueia)
        let myNumber = "";
        try {
          const infoUrl = `${baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`;
          const infoRes = await fetch(infoUrl, { headers: { apikey: apiKey } });
          const infoRaw = await infoRes.text();
          console.log("[fetch-groups] fetchInstances", {
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
          console.log("[fetch-groups] myNumber", myNumber || "(não resolvido)");
        } catch (e) {
          console.log("[fetch-groups] fetchInstances erro", String(e));
        }

        // Tentativas em sequência
        const attempts = [
          {
            name: "fetchAllGroups?getParticipants=true",
            url: `${baseUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=true`,
          },
          {
            name: "fetchAllGroups (sem participants)",
            url: `${baseUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}`,
          },
          {
            name: "group/list",
            url: `${baseUrl}/group/list/${encodeURIComponent(instance)}`,
          },
        ];

        let list: EvoGroup[] = [];
        let lastStatus = 0;
        let lastBody = "";
        let usedAttempt = "";

        for (const attempt of attempts) {
          try {
            const res = await fetch(attempt.url, { headers: { apikey: apiKey } });
            const text = await res.text();
            lastStatus = res.status;
            lastBody = text;

            let parsed: any = null;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = null;
            }
            const candidate: EvoGroup[] = Array.isArray(parsed)
              ? parsed
              : (parsed?.groups ?? parsed?.data ?? []);

            console.log(`[fetch-groups] tentativa "${attempt.name}"`, {
              url: attempt.url,
              status: res.status,
              ok: res.ok,
              count: Array.isArray(candidate) ? candidate.length : 0,
              bodyPreview: text.slice(0, 300),
            });

            if (res.ok && Array.isArray(candidate) && candidate.length > 0) {
              list = candidate;
              usedAttempt = attempt.name;
              break;
            }
          } catch (e) {
            console.log(`[fetch-groups] tentativa "${attempt.name}" erro`, String(e));
            lastBody = String(e);
          }
        }

        console.log("[fetch-groups] resultado tentativas", {
          usedAttempt: usedAttempt || "(nenhuma)",
          total: list.length,
        });

        if (list.length === 0) {
          return Response.json(
            {
              error: "Evolution API error",
              status: lastStatus,
              detail: lastBody.slice(0, 1000),
            },
            { status: 502, headers: CORS },
          );
        }

        const mapped = list.map((g) => {
          const participants = g.participants ?? [];
          const admins = participants.filter(
            (p) => p.admin === "admin" || p.admin === "superadmin",
          );
          // Filtro de admin desativado temporariamente — retornando todos os grupos
          // const isCommunityLike = !!g.isCommunity || !!g.isCommunityAnnounce;
          // const iAmAdmin = isCommunityLike
          //   ? true
          //   : myNumber
          //     ? admins.some((p) => digits(p.id) === myNumber)
          //     : true;
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
          };
        });

        console.log("[fetch-groups] retornando", {
          total: mapped.length,
          usedAttempt,
        });

        return Response.json(
          {
            groups: mapped,
            total: mapped.length,
            lastUpdated: new Date().toISOString(),
            _debug: { usedAttempt, myNumber: myNumber || null },
          },
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      },
    },
  },
});
