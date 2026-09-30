import { createSignal, Show } from "solid-js";
import { MapPin, Navigation, ExternalLink, AlertCircle, CheckCircle2, Loader2 } from "lucide-solid";

export interface GpsLocationData {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  locationSource: "gps_device" | "maps_pin" | "manual";
}

interface GpsPickerProps {
  location: GpsLocationData;
  onChange: (loc: GpsLocationData) => void;
  onAddressResolved?: (formattedAddress: string) => void;
}

export function GpsPicker(props: GpsPickerProps) {
  const [isLoading, setIsLoading] = createSignal(false);
  const [isGeocoding, setIsGeocoding] = createSignal(false);
  const [gpsError, setGpsError] = createSignal<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = createSignal<string | null>(null);

  const handleGetLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGpsError("Browser Anda tidak mendukung deteksi lokasi otomatis. Silakan tulis alamat manual.");
      return;
    }

    setIsLoading(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsLoading(false);
        const lat = Number(pos.coords.latitude.toFixed(7));
        const lng = Number(pos.coords.longitude.toFixed(7));
        const acc = Math.round(pos.coords.accuracy);

        props.onChange({
          latitude: lat,
          longitude: lng,
          accuracyM: acc,
          locationSource: "gps_device",
        });

        // Ambil alamat lengkap presisi secara otomatis via reverse-geocoding
        setIsGeocoding(true);
        try {
          const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            const data = await res.json();
            if (data.formattedAddress) {
              setResolvedAddress(data.formattedAddress);
              if (props.onAddressResolved) {
                props.onAddressResolved(data.formattedAddress);
              }
            }
          }
        } catch (e) {
          console.warn("Auto reverse geocode error:", e);
        } finally {
          setIsGeocoding(false);
        }
      },
      (err) => {
        setIsLoading(false);
        let errorMsg = "Tidak dapat mengambil lokasi GPS.";
        if (err.code === 1) {
          errorMsg = "Izin lokasi tidak diberikan. Anda tetap bisa memasukkan alamat pengiriman secara manual.";
        } else if (err.code === 2) {
          errorMsg = "Sinyal GPS tidak terdeteksi. Silakan coba di luar ruangan atau isi alamat manual.";
        } else if (err.code === 3) {
          errorMsg = "Waktu pencarian lokasi habis. Silakan coba lagi atau isi alamat manual.";
        }
        setGpsError(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const mapsUrl = () => {
    if (props.location.latitude && props.location.longitude) {
      return `https://maps.google.com/?q=${props.location.latitude},${props.location.longitude}`;
    }
    return null;
  };

  return (
    <div class="p-4 rounded-xl border border-[#E8E8EC] bg-[#FAFAFA] space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <MapPin size={18} class="text-[#6366F1]" />
          <span class="text-xs sm:text-sm font-semibold text-[#0A0A0A]">
            Titik Koordinat Pengantaran (GPS)
          </span>
        </div>

        <button
          type="button"
          onClick={handleGetLocation}
          disabled={isLoading()}
          class="btn-primary btn-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Show when={isLoading()} fallback={<Navigation size={13} />}>
            <Loader2 size={13} class="animate-spin" />
          </Show>
          <span>{isLoading() ? "Mencari Lokasi..." : "Gunakan Lokasi Saya"}</span>
        </button>
      </div>

      {/* GPS Info Status */}
      <Show when={props.location.latitude && props.location.longitude}>
        <div class="p-3 bg-white rounded-lg border border-[#E8E8EC] text-xs space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-medium text-[#10B981] flex items-center gap-1">
              <CheckCircle2 size={14} /> Koordinat berhasil didapatkan
            </span>
            <Show when={mapsUrl()}>
              <a
                href={mapsUrl()!}
                target="_blank"
                rel="noreferrer"
                class="text-[#6366F1] hover:underline flex items-center gap-1 font-mono text-[11px]"
              >
                <span>Lihat di Maps</span>
                <ExternalLink size={12} />
              </a>
            </Show>
          </div>

          <div class="font-mono text-[11px] text-[#6B6B6B]">
            Lat: {props.location.latitude}, Lng: {props.location.longitude}
            <Show when={props.location.accuracyM !== null}>
              <span class="ml-2">• Akurasi: ~{props.location.accuracyM} m</span>
            </Show>
          </div>

          <Show when={isGeocoding()}>
            <div class="flex items-center gap-1.5 text-[11px] text-[#6366F1] py-1">
              <Loader2 size={12} class="animate-spin" />
              <span>Mengambil nama jalan & detail alamat presisi...</span>
            </div>
          </Show>

          <Show when={resolvedAddress()}>
            <div class="p-2 rounded bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-[11px] space-y-0.5">
              <div class="font-semibold flex items-center gap-1 text-[#15803D]">
                <CheckCircle2 size={12} /> Alamat presisi terisi otomatis:
              </div>
              <div class="text-[#0A0A0A] font-medium leading-relaxed">
                {resolvedAddress()}
              </div>
              <span class="text-[10px] text-[#15803D] block">
                Alamat pengiriman di atas telah terisi otomatis. Anda dapat melengkapi nomor rumah/patokan bila diperlukan.
              </span>
            </div>
          </Show>
        </div>
      </Show>

      {/* Error Message */}
      <Show when={gpsError()}>
        <div class="p-2.5 rounded-lg bg-[#FFF5F5] border border-[#FCA5A5] text-xs text-[#EF4444] flex items-start gap-2">
          <AlertCircle size={14} class="shrink-0 mt-0.5" />
          <span>{gpsError()}</span>
        </div>
      </Show>
    </div>
  );
}
