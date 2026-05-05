import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/send-message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const baseUrl = process.env.EVOLUTION_BASE_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const defaultInstance = process.env.EVOLUTION_INSTANCE_NAME;
        if (!baseUrl || !apiKey) {
          return Response.json({ error: "Evolution env not configured" }, { status: 500 });
        }
        const body = await request.json().catch(() => ({}));
        const { number, lead_id, type, content, media_url, file_name, mimetype, instance } = body || {};
        const inst = instance || defaultInstance;
        if ((!number && !lead_id) || !type || !inst) {
          return Response.json({ error: "Missing number/lead_id/type/instance" }, { status: 400 });
        }
        let target = number;
        if (lead_id) {
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("whatsapp_number, remote_jid")
            .eq("id", lead_id)
            .maybeSingle();
          target = (lead as any)?.remote_jid || (lead as any)?.whatsapp_number || number;
        }
        const headers = { "Content-Type": "application/json", apikey: apiKey };
        let endpoint = "";
        let payload: any = {};
        const t = String(type).toLowerCase();

        if (t === "text") {
          endpoint = `/message/sendText/${inst}`;
          payload = { number: target, text: content || "", delay: 800 };
        } else if (t === "image") {
          endpoint = `/message/sendMedia/${inst}`;
          payload = { number: target, mediatype: "image", mimetype: mimetype || "image/jpeg", media: media_url, fileName: file_name || "image.jpg", caption: content || "", delay: 800 };
        } else if (t === "video") {
          endpoint = `/message/sendMedia/${inst}`;
          payload = { number: target, mediatype: "video", mimetype: mimetype || "video/mp4", media: media_url, fileName: file_name || "video.mp4", caption: content || "", delay: 800 };
        } else if (t === "audio") {
          endpoint = `/message/sendWhatsAppAudio/${inst}`;
          payload = { number: target, audio: media_url, delay: 500 };
        } else if (t === "document") {
          endpoint = `/message/sendMedia/${inst}`;
          payload = { number: target, mediatype: "document", mimetype: mimetype || "application/pdf", media: media_url, fileName: file_name || "arquivo.pdf", caption: "", delay: 500 };
        } else {
          return Response.json({ error: `Unsupported type: ${t}` }, { status: 400 });
        }

        const res = await fetch(`${baseUrl}${endpoint}`, {
          method: "POST", headers, body: JSON.stringify(payload),
        });
        const json: any = await res.json().catch(() => ({}));
        return Response.json(
          { success: res.ok, evolution_message_id: json?.key?.id, raw: json },
          { status: res.ok ? 200 : 500 }
        );
      },
    },
  },
});
