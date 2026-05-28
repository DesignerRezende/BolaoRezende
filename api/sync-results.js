export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    message: "sync-results respondeu",
    receivedSecret: req.query.secret || null,
    hasSyncSecret: Boolean(process.env.SYNC_RESULTS_SECRET),
    secretMatches: req.query.secret === process.env.SYNC_RESULTS_SECRET,
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasSupabaseServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasApiFootballKey: Boolean(process.env.APIFOOTBALL_KEY),
    time: new Date().toISOString()
  });
}