/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Response headers every route sends.
   *
   * None of these change what the site does; each one closes a way a browser
   * could be talked into doing something else with it. No Content-Security-
   * Policy yet - the marketing walk uses inline styles, GSAP, and fonts from
   * gstatic, and a CSP that isn't tested against all of that breaks the page
   * silently. It is the next header to add, with a report-only pass first.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Never let a response be sniffed into a different type than it says.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nothing here is meant to be framed; the share card is drawn client-side.
          { key: "X-Frame-Options", value: "DENY" },
          // Full URL to same origin, origin only elsewhere. Closet codes are in
          // URLs and don't need to travel to marketplaces in a Referer.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // File inputs don't need these; nothing else on the site does either.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // TLS is terminated by the host; this pins browsers to it.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
