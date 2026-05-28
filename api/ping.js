export default function handler(req, res) {
  return res.status(200).json({
    ok: true,
    message: "API da Vercel funcionando",
    time: new Date().toISOString()
  });
}