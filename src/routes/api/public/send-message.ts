import { createFileRoute } from "@tanstack/react-router";

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
        const { number, type, content, media_url, file_name, mimetype, instance } = body || {};
        const inst = instance || defaultInstance;
        if (!number || !type || !inst) {
          return Response.json({ error: "Missing number/type/instance" }, { status: 400 });
        }
        const headers = { "Content-Type": "application/json", apikey: apiKey };
        let endpoint = "";
        let payload: any = {};
        const t = String(type).toLowerCase();

        if (t === "text") {
          endpoint = `/message/sendText/${inst}`;
          payload = { number, text: content || "", delay: 800 };
        } else if (t === "image") {
          endpoint = `/message/sendMedia/${inst}`;
          payload = { number, mediatype: "image", mimetype: mimetype || "image/jpeg", media: media_url, fileName: file_name || "image.jpg", caption: content || "", delay: 800 };
        } else if (t === "video") {
          endpoint = `/message/sendMedia/${inst}`;
          payload = { number, mediatype: "video", mimetype: mimetype || "video/mp4", media: media_url, fileName: file_name || "video.mp4", caption: content || "", delay: 800 };
        } else if (t === "audio") {
          endpoint = `/message/sendWhatsAppAudio/${inst}`;
          payload = { number, audio: media_url, delay: 500 };
        } else if (t === "document") {
          endpoint = `/message/sendMedia/${inst}`;
          payload = { number, mediatype: "document", mimetype: mimetype || "application/pdf", media: media_url, fileName: file_name || "arquivo.pdf", caption: "", delay: 500 };
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
