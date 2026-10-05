import { query, createAsync, useParams, useSearchParams, A } from "@solidjs/router";
import { Show } from "solid-js";
import { getOrderForTracking } from "~/lib/services/order";
import { getStoreSettings } from "~/lib/services/settings";
import { OrderDetailView } from "~/components/tracking/OrderDetailView";
import { AlertCircle, Search, ArrowLeft } from "lucide-solid";

const getOrderData = query(async (id: string, phoneLast4?: string) => {
  "use server";
  try {
    const [order, settings] = await Promise.all([
      getOrderForTracking(id, phoneLast4),
      getStoreSettings(),
    ]);
    return { order, settings, error: null };
  } catch (err: any) {
    return { order: null, settings: null, error: err?.message || "Gagal memuat pesanan" };
  }
}, "orderTrackingData");

export default function TrackDetailPage() {
  const params = useParams<{ id: string }>();
  const [searchParams] = useSearchParams<{ phoneLast4?: string }>();

  const data = createAsync(() => getOrderData(params.id, searchParams.phoneLast4));

  return (
    <div class="min-h-screen bg-[#FFF4DE] py-8 px-4 sm:px-6">
      <div class="max-w-4xl mx-auto space-y-6">
        {/* Navigation Back */}
        <div class="flex items-center justify-between">
          <A
            href="/track"
            class="text-xs sm:text-sm font-medium text-[#806B5C] hover:text-[#5B4638] flex items-center gap-1.5 transition"
          >
            <ArrowLeft size={16} />
            <span>Cari Pesanan Lain</span>
          </A>

          <A
            href="/"
            class="text-xs sm:text-sm font-semibold text-[#D92D3A] hover:underline"
          >
            Kembali ke Pre-Order
          </A>
        </div>

        {/* State Content */}
        <Show
          when={data()?.order}
          fallback={
            <div class="card-surface p-8 bg-[#FFFDF8] border border-[#E7D8C3] rounded-2xl text-center space-y-4 max-w-md mx-auto my-12 shadow-xs">
              <div class="w-12 h-12 rounded-full bg-[#FFF5F5] text-[#D92D3A] flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
              </div>
              <h2 class="font-heading font-bold text-xl text-[#5B4638]">
                Pesanan Tidak Ditemukan
              </h2>
              <p class="text-xs sm:text-sm text-[#806B5C]">
                {data()?.error ||
                  `Tidak ada pesanan yang cocok dengan kode "${params.id}". Pastikan kode yang Anda masukkan sudah benar.`}
              </p>
              <div class="pt-2">
                <A href="/track" class="btn-primary btn-sm inline-flex items-center gap-1.5">
                  <Search size={14} />
                  <span>Coba Cari Lagi</span>
                </A>
              </div>
            </div>
          }
        >
          <OrderDetailView
            order={data()!.order}
            adminPhone={data()?.settings?.adminPhone || "6281234567890"}
            storeSettings={data()?.settings || undefined}
          />
        </Show>
      </div>
    </div>
  );
}
