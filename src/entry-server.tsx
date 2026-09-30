// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
          <title>Mol-Mol Purwokerto • Dessert & Cemilan Purwokerto</title>
          <meta
            name="description"
            content="Mol-Mol Purwokerto (@molmol.purwokerto) — Dessert & Cemilan Purwokerto manis dan gurih khas Purwokerto dengan sistem pre-order berkala. Pesan online langsung sekarang."
          />
          <meta
            name="keywords"
            content="Mol-Mol Purwokerto, dessert purwokerto, cemilan purwokerto, kuliner purwokerto, jajanan purwokerto, pre order cemilan purwokerto, molmol.purwokerto"
          />
          <meta name="author" content="Mol-Mol Purwokerto (@molmol.purwokerto)" />
          <meta name="theme-color" content="#6366F1" />
          <meta name="robots" content="index, follow" />

          {/* Open Graph / Facebook / Instagram */}
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Mol-Mol Purwokerto" />
          <meta property="og:title" content="Mol-Mol Purwokerto • Dessert & Cemilan Purwokerto" />
          <meta
            property="og:description"
            content="Mol-Mol Purwokerto (@molmol.purwokerto) — Nikmati kelezatan dessert & cemilan manis gurih khas Purwokerto dengan sistem pre-order berkala."
          />
          <meta property="og:locale" content="id_ID" />

          {/* Twitter Card */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Mol-Mol Purwokerto • Dessert & Cemilan Purwokerto" />
          <meta
            name="twitter:description"
            content="Mol-Mol Purwokerto (@molmol.purwokerto) — Dessert & Cemilan Purwokerto manis gurih khas Purwokerto sistem pre-order berkala."
          />

          <link rel="icon" href="/favicon.ico" />

          {/* JSON-LD Schema LocalBusiness / Bakery */}
          <script
            type="application/ld+json"
            innerHTML={JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Bakery",
              name: "Mol-Mol Purwokerto",
              alternateName: "Dessert & Cemilan Purwokerto (@molmol.purwokerto)",
              description:
                "Dessert & Cemilan Purwokerto manis dan gurih dengan sistem pre-order berkala.",
              sameAs: [
                "https://www.instagram.com/molmol.purwokerto/",
                "https://www.threads.com/@molmol.purwokerto",
                "https://www.tiktok.com/@molmol.purwokerto"
              ],
              address: {
                "@type": "PostalAddress",
                addressLocality: "Purwokerto",
                addressRegion: "Jawa Tengah",
                addressCountry: "ID",
              },
              servesCuisine: "Dessert & Cemilan",
              priceRange: "Rp 20.000 - Rp 50.000",
            })}
          />

          {assets}
        </head>
        <body class="overflow-x-hidden antialiased">
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
