import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Web only: root HTML for the static export. Loads Space Grotesk and IBM Plex Sans from Google Fonts.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            // Responsive switches done in CSS so the layout never changes after the page loads (no moving click targets):
            // desktop (>= 900 px) shows the side nav, phones show the bottom tab bar; the account chip is compact on phones.
            __html:
              "body{background-color:#F4F1E8;}" +
              "@media (min-width:900px){[data-kv=tabbar]{display:none !important}}" +
              "@media (max-width:899px){[data-kv=side]{display:none !important}[data-kv=chip]{max-width:150px !important}[data-kv=chipsub]{display:none !important}[data-kv=chipwho]{display:none !important}[data-kv=chipwide]{display:none !important}}" +
              "@media (min-width:900px){[data-kv=chipnarrow]{display:none !important}[data-kv=toast]{left:auto !important;width:360px !important;right:16px !important;top:16px !important;align-items:flex-end !important}}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
