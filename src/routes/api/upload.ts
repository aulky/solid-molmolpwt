import type { APIEvent } from "@solidjs/start/server";
import { saveUploadedImage, ALLOWED_IMAGE_MIMES, MAX_FILE_SIZE_BYTES } from "~/lib/storage";
import { formatSafeErrorMessage } from "~/lib/debug";

export async function POST(event: APIEvent) {
  try {
    const formData = await event.request.formData();
    const file = formData.get("file");
    const category = (formData.get("category") as "proofs" | "menus" | "settings") || "proofs";

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "File tidak ditemukan dalam request." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return new Response(
        JSON.stringify({ error: "Ukuran file melebihi batas maksimal 4 MB." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: "Hanya format gambar JPG, PNG, atau WebP yang diizinkan." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const saved = await saveUploadedImage(buffer, file.name, category, file.type);

    return new Response(
      JSON.stringify({
        success: true,
        url: saved.relativePath,
        path: saved.relativePath,
        size: saved.sizeBytes,
        mime: saved.mime,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Upload error:", err);
    return new Response(
      JSON.stringify({ error: formatSafeErrorMessage(err, "Gagal memproses file upload.") }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
