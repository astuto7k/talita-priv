export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "ID é obrigatório" });
  }

  const token = process.env.PINPAY_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "PINPAY_TOKEN não configurado." });
  }

  try {
    const url = `https://api.usepinpay.com/functions/v1/api-v1/pix/${id}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      console.error("[pinpay] falha ao consultar status", response.status);
      return res.status(502).json({ error: "Erro ao consultar status no gateway." });
    }

    const data = await response.json();
    const status = data.status || "pending";
    const paid = ["paid", "approved", "success"].includes(status);
    
    return res.status(200).json({ id, status, paid });

  } catch (error) {
    console.error("[status-pix error]", error);
    return res.status(500).json({ error: "Erro interno ao consultar status." });
  }
}
