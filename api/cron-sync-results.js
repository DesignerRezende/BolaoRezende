function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "").trim();
}

function getSecret() {
  return clean(process.env.SYNC_RESULTS_SECRET) || clean(process.env.CRON_SECRET) || "teste123";
}

export default async function handler(req, res) {
  try {
    const host =
      req.headers["x-forwarded-host"] ||
      req.headers.host ||
      process.env.VERCEL_URL;

    const protocol = host && String(host).includes("localhost") ? "http" : "https";
    const baseUrl = String(host).startsWith("http")
      ? String(host)
      : `${protocol}://${host}`;

    const secret = encodeURIComponent(getSecret());

    const url = `${baseUrl}/api/sync-results?all=1&secret=${secret}`;

    const response = await fetch(url, {
      method: "GET"
    });

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      return res.status(500).json({
        ok: false,
        source: "cron-sync-results",
        error: data
      });
    }

    return res.status(200).json({
      ok: true,
      source: "cron-sync-results",
      ran_at: new Date().toISOString(),
      sync: data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      source: "cron-sync-results",
      error: error.message
    });
  }
}
