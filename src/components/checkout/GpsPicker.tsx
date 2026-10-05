import { createSignal, Show } from "solid-js";
import { MapPin, Navigation, ExternalLink, AlertCircle, CheckCircle2, Loader2, Link2, HelpCircle } from "lucide-solid";

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
  const [showManualInput, setShowManualInput] = createSignal(false);
  const [manualInputVal, setManualInputVal] = createSignal("");
  const [manualError, setManualError] = createSignal<string | null>(null);

  const reverseGeocode = async (lat: number, lng: number) => {
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
  };

  const handleGetLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGpsError("Browser Anda tidak mendukung deteksi lokasi otomatis. Silakan masukkan alamat atau tautan Google Maps manual.");
      return;
    }

    if (window.isSecureContext === false && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setGpsError("Deteksi GPS di smartphone memerlukan protokol HTTPS. Silakan masukkan alamat atau koordinat secara manual.");
      return;
    }

    setIsLoading(true);
    setGpsError(null);

    const onGeoSuccess = async (pos: GeolocationPosition) => {
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

      await reverseGeocode(lat, lng);
    };

    const tryFallbackLowAccuracy = () => {
      navigator.geolocation.getCurrentPosition(
        onGeoSuccess,
        (err) => {
          setIsLoading(false);
          let errorMsg = "Tidak dapat mengambil lokasi GPS pada ponsel Anda.";
          if (err.code === 1) {
            errorMsg = "Izin lokasi tidak diberikan. Aktifkan izin lokasi di setelan browser ponsel atau tempel link Google Maps di bawah.";
          } else if (err.code === 2) {
            errorMsg = "Layanan lokasi GPS di ponsel tidak aktif / sinyal lemah. Aktifkan GPS di ponsel atau gunakan link Google Maps.";
          } else if (err.code === 3) {
            errorMsg = "Waktu pencarian lokasi habis. Silakan coba lagi atau masukkan link Google Maps manual.";
          }
          setGpsError(errorMsg);
        },
        {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 300000,
        }
      );
    };

    // Upaya pertama: High accuracy dengan toleransi cache 30 detik (agar cepat di mobile)
    navigator.geolocation.getCurrentPosition(
      onGeoSuccess,
      (err) => {
        // Pada mobile, satelit hardware GPS sering timeout atau unavailable di dalam ruangan.
        // Langsung fallback otomatis ke pemosisian jaringan/seluler (low accuracy) yang cepat dan stabil.
        if (err.code === 2 || err.code === 3) {
          console.warn("Mobile high accuracy GPS timeout/unavailable, mencoba pemosisian jaringan...");
          tryFallbackLowAccuracy();
        } else {
          setIsLoading(false);
          if (err.code === 1) {
            setGpsError("Izin lokasi tidak diberikan. Aktifkan izin lokasi browser di ponsel Anda atau tempel link Google Maps di bawah.");
          } else {
            setGpsError("Gagal mendeteksi lokasi otomatis. Silakan gunakan link Google Maps atau isi alamat manual.");
          }
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      }
    );
  };

  const handleApplyManualMaps = async () => {
    const raw = manualInputVal().trim();
    setManualError(null);
    if (!raw) {
      setManualError("Masukkan koordinat (lat, lng) atau tautan Google Maps.");
      return;
    }

    // Pola regex untuk mengekstrak latitude dan longitude dari string / URL Google Maps
    // Contoh: "-7.424312, 109.248671" atau "?q=-7.424312,109.248671" atau "@-7.424312,109.248671,17z"
    const coordRegex = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/;
    const qParamRegex = /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/;
    const atRegex = /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/;

    let lat: number | null = null;
    let lng: number | null = null;

    const qMatch = raw.match(qParamRegex);
    const atMatch = raw.match(atRegex);
    const coordMatch = raw.match(coordRegex);

    if (qMatch) {
      lat = parseFloat(qMatch[1]);
      lng = parseFloat(qMatch[2]);
    } else if (atMatch) {
      lat = parseFloat(atMatch[1]);
      lng = parseFloat(atMatch[2]);
    } else if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lng = parseFloat(coordMatch[2]);
    }

    if (lat === null || lng === null || isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setManualError("Format tidak dikenali. Contoh yang didukung: -7.424312, 109.248671 atau link URL Google Maps.");
      return;
    }

    props.onChange({
      latitude: Number(lat.toFixed(7)),
      longitude: Number(lng.toFixed(7)),
      accuracyM: null,
      locationSource: "maps_pin",
    });

    setGpsError(null);
    setShowManualInput(false);
    await reverseGeocode(Number(lat.toFixed(7)), Number(lng.toFixed(7)));
  };

  const mapsUrl = () => {
    if (props.location.latitude && props.location.longitude) {
      return `https://maps.google.com/?q=${props.location.latitude},${props.location.longitude}`;
    }
    return null;
  };

  return (
    <div class="p-3.5 sm:p-4 rounded-2xl border border-[#E2CCA8] bg-[#F3E2C4] space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-[#D92D3A]/10 flex items-center justify-center text-[#D92D3A] shrink-0">
            <MapPin size={16} />
          </div>
          <div>
            <span class="text-xs sm:text-sm font-semibold text-[#5B4638] block">
              Titik Koordinat Pengantaran (GPS)
            </span>
            <span class="text-xs text-[#806B5C] block">
              Memudahkan kurir mengantarkan langsung ke titik rumah Anda
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGetLocation}
            disabled={isLoading()}
            class="btn-primary btn-sm flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <Show when={isLoading()} fallback={<Navigation size={13} />}>
              <Loader2 size={13} class="animate-spin" />
            </Show>
            <span>{isLoading() ? "Mencari Lokasi..." : "Gunakan Lokasi Saya"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowManualInput(!showManualInput())}
            class="p-1.5 text-xs text-[#806B5C] hover:text-[#D92D3A] border border-[#E2CCA8] rounded-xl bg-[#FFF9EE] hover:bg-[#F3E2C4] transition cursor-pointer"
            title="Tempel link Google Maps atau koordinat manual"
          >
            <Link2 size={14} />
          </button>
        </div>
      </div>

      {/* Manual Maps / Coordinate Paste Input */}
      <Show when={showManualInput()}>
        <div class="p-3 bg-[#FFF9EE] rounded-xl border border-[#D92D3A]/30 shadow-2xs space-y-2 animate-in fade-in duration-150">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium text-[#5B4638] flex items-center gap-1">
              <Link2 size={13} class="text-[#D92D3A]" />
              <span>Tempel Link / Koordinat Google Maps</span>
            </span>
            <button
              type="button"
              onClick={() => setShowManualInput(false)}
              class="text-[11px] text-[#806B5C] hover:text-[#5B4638]"
            >
              Tutup
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input
              type="text"
              value={manualInputVal()}
              onInput={(e) => setManualInputVal(e.currentTarget.value)}
              placeholder="Contoh: -7.424312, 109.248671 atau link Maps"
              class="input-base text-xs flex-1"
            />
            <button
              type="button"
              onClick={handleApplyManualMaps}
              class="btn-primary btn-sm text-xs px-3 shrink-0 cursor-pointer"
            >
              Terapkan
            </button>
          </div>
          <Show when={manualError()}>
            <p class="text-[11px] text-[#D92D3A]">{manualError()}</p>
          </Show>
          <p class="text-[10px] text-[#806B5C]">
            Tips: Buka Google Maps di HP, tahan titik rumah Anda, lalu salin koordinat atau tautan bagikan.
          </p>
        </div>
      </Show>

      {/* GPS Info Status */}
      <Show when={props.location.latitude && props.location.longitude}>
        <div class="p-3 bg-[#FFF9EE] rounded-xl border border-[#E2CCA8] text-xs space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-medium text-[#7FA37A] flex items-center gap-1">
              <CheckCircle2 size={14} /> Titik koordinat tersimpan
            </span>
            <Show when={mapsUrl()}>
              <a
                href={mapsUrl()!}
                target="_blank"
                rel="noreferrer"
                class="text-[#D92D3A] hover:underline flex items-center gap-1 text-xs font-medium"
              >
                <span>Lihat di Maps</span>
                <ExternalLink size={12} />
              </a>
            </Show>
          </div>

          <div class="text-xs text-[#806B5C] font-medium">
            Lat: {props.location.latitude}, Lng: {props.location.longitude}
            <Show when={props.location.accuracyM !== null}>
              <span class="ml-2">• Akurasi: ~{props.location.accuracyM} m</span>
            </Show>
            <Show when={props.location.locationSource === "maps_pin"}>
              <span class="ml-2 text-[#D92D3A] font-sans font-medium">(Pin Google Maps)</span>
            </Show>
          </div>

          <Show when={isGeocoding()}>
            <div class="flex items-center gap-1.5 text-[11px] text-[#D92D3A] py-1">
              <Loader2 size={12} class="animate-spin" />
              <span>Mengambil nama jalan & detail alamat presisi...</span>
            </div>
          </Show>

          <Show when={resolvedAddress()}>
            <div class="p-2.5 rounded-lg bg-[#7FA37A]/10 border border-[#7FA37A]/25 text-[#547C4F] text-[11px] space-y-0.5">
              <div class="font-semibold flex items-center gap-1 text-[#547C4F]">
                <CheckCircle2 size={12} /> Alamat presisi terisi otomatis:
              </div>
              <div class="text-[#5B4638] font-medium leading-relaxed">
                {resolvedAddress()}
              </div>
              <span class="text-[10px] text-[#547C4F] block">
                Alamat pengiriman di atas telah terisi otomatis. Anda dapat melengkapi nomor rumah/patokan bila diperlukan.
              </span>
            </div>
          </Show>
        </div>
      </Show>

      {/* Error Message */}
      <Show when={gpsError()}>
        <div class="p-2.5 rounded-xl bg-[#FFF5F5] border border-[#FECDD3] text-xs text-[#D92D3A] flex items-start gap-2">
          <AlertCircle size={14} class="shrink-0 mt-0.5" />
          <div class="space-y-1">
            <span>{gpsError()}</span>
            <Show when={!showManualInput()}>
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                class="text-[11px] text-[#D92D3A] underline font-medium block cursor-pointer"
              >
                Gunakan link / koordinat Google Maps secara manual
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
