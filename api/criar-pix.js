import { randomUUID } from "node:crypto";

const PINPAY_CREATE_URL = "https://api.usepinpay.com/functions/v1/api-v1/pix";

const digits = (value) => String(value ?? "").replace(/\D/g, "");
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? ""));

function generateCPF() {
  const num = () => Math.floor(Math.random() * 9);
  const n = Array.from({ length: 9 }, num);
  
  let d1 = n.reduce((acc, curr, idx) => acc + curr * (10 - idx), 0);
  d1 = 11 - (d1 % 11);
  if (d1 >= 10) d1 = 0;
  
  let d2 = n.reduce((acc, curr, idx) => acc + curr * (11 - idx), 0) + d1 * 2;
  d2 = 11 - (d2 % 11);
  if (d2 >= 10) d2 = 0;
  
  return [...n, d1, d2].join("");
}

function validateCustomer(customer = {}) {
  const name = String(customer.name || "Cliente VIP").trim();
  const email = String(customer.email ?? "").trim();
  const document = digits(customer.document || generateCPF());
  const phone = digits(customer.phone ?? "");
  
  if (!validEmail(email) || phone.length < 10) {
    const error = new Error("Dados inválidos. Digite seu e-mail e telefone corretamente.");
    error.status = 400;
    throw error;
  }
  return { name, email, document, phone };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const amount = payload.amount || 2790;
    const customer = payload.customer || {};
    const idempotencyKey = req.headers["idempotency-key"] || randomUUID();

    const normalized = validateCustomer(customer);

    const token = process.env.PINPAY_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "PINPAY_TOKEN não configurado." });
    }

    const appUrl = process.env.APP_URL || "https://talita-priv.vercel.app";
    
    const body = {
      amount: amount,
      description: amount === 2790 ? "PRODUTO 27" : "PRODUTO 19",
      customer: { 
        name: normalized.name, 
        email: normalized.email, 
        document: { type: "CPF", number: normalized.document }, 
        phone: normalized.phone 
      },
      expires_in: 900,
      metadata: { 
        product: amount === 2790 ? "PRODUTO 27" : "PRODUTO 19", 
        version: "1", 
        external_reference: idempotencyKey, 
        checkout_url: appUrl 
      },
    };

    const response = await fetch(PINPAY_CREATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      console.error("[pinpay] falha ao gerar PIX", { status: response.status, data });
      return res.status(502).json({ error: data.message || "Erro no gateway de pagamento." });
    }

    return res.status(200).json({ 
      success: true, 
      id: data.id, 
      qrCode: data.pix?.qr_code || null, 
      qrCodeUrl: data.pix?.qr_code_url || null, 
      expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
      status: data.status || "pending", 
      amount: amount 
    });

  } catch (error) {
    console.error("[api error]", error);
    return res.status(error.status || 500).json({ error: error.message || "Erro interno do servidor." });
  }
}
