import type { APIEvent } from "@solidjs/start/server";

export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");

    if (!lat || !lng) {
      return new Response(JSON.stringify({ error: "Parameter lat dan lng wajib diisi" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return new Response(JSON.stringify({ error: "Koordinat lat/lng tidak valid" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Panggil OpenStreetMap Nominatim API untuk reverse geocode presisi
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=id`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "MolMolPurwokerto/1.0 (https://instagram.com/molmol.purwokerto)",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Nominatim returned status ${res.status}`);
    }

    const data = await res.json();
    const addr = data.address || {};

    // Bangun alamat presisi Indonesia
    const parts = [];
    const road = addr.road || addr.street || addr.pedestrian || addr.footway || addr.path;
    const houseNumber = addr.house_number;
    if (road) {
      parts.push(houseNumber ? `${road} No. ${houseNumber}` : road);
    }

    const neighbourhood = addr.neighbourhood || addr.suburb || addr.hamlet;
    const village = addr.village || addr.quarter;
    if (neighbourhood) parts.push(neighbourhood);
    if (village && village !== neighbourhood) parts.push(village);

    const subdistrict = addr.municipality || addr.city_district || addr.district;
    if (subdistrict) parts.push(subdistrict);

    const city = addr.city || addr.town || addr.county || addr.regency;
    if (city) parts.push(city);

    const province = addr.state;
    if (province && !parts.includes(province)) parts.push(province);

    const postcode = addr.postcode;
    if (postcode) parts.push(postcode);

    const cleanFormatted = parts.length > 0 ? parts.join(", ") : (data.display_name || "");

    return new Response(
      JSON.stringify({
        success: true,
        latitude,
        longitude,
        formattedAddress: cleanFormatted,
        displayName: data.display_name || cleanFormatted,
        addressDetails: addr,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (err: any) {
    console.warn("Geocoding reverse error:", err?.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || "Gagal mendapatkan nama alamat dari titik GPS",
      }),
      {
        status: 200, // kembalikan status 200 agar client bisa handle gracefully
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
