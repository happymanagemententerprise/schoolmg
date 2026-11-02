// Minimal SMTP client (implicit TLS, port 465) with AUTH LOGIN. Enough to
// send a transactional email from an edge function via a standard SMTP relay
// (Gmail app password, Brevo, Mailgun, SMTP2GO, …). Uses Deno.connectTls.
//
// Env: SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASS, SMTP_FROM

interface MailOptions { to: string; subject: string; html: string; }

async function connect(): Promise<Deno.TlsConn> {
  const host = Deno.env.get("SMTP_HOST") || "";
  const port = Number(Deno.env.get("SMTP_PORT") || 465);
  if (!host) throw new Error("SMTP_HOST not set");
  return await Deno.connectTls({ hostname: host, port });
}

// Read a full SMTP reply (possibly multi-line, each "nnn-" continues, "nnn " ends).
async function readReply(conn: Deno.TlsConn, buf: { s: string }): Promise<string> {
  const dec = new TextDecoder();
  const chunks = new Uint8Array(4096);
  for (;;) {
    // Return any complete lines we already have.
    const nl = buf.s.indexOf("\r\n");
    if (nl >= 0) {
      const line = buf.s.slice(0, nl);
      buf.s = buf.s.slice(nl + 2);
      if (line.length >= 4 && line[3] === " ") return line; // final line
      // continuation line — keep reading until a final line arrives
      continue;
    }
    const n = await conn.read(chunks);
    if (n === null) return buf.s;
    buf.s += dec.decode(chunks.subarray(0, n));
  }
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const user = Deno.env.get("SMTP_USER") || "";
  const pass = Deno.env.get("SMTP_PASS") || "";
  const from = Deno.env.get("SMTP_FROM") || user;
  if (!user || !pass) throw new Error("SMTP_USER / SMTP_PASS not set");

  const conn = await connect();
  const buf = { s: "" };
  const w = (s: string) => conn.write(new TextEncoder().encode(s + "\r\n"));
  try {
    await readReply(conn, buf);             // 220 greeting
    w("EHLO hma.app");
    await readReply(conn, buf);             // 250 …
    w("AUTH LOGIN");
    await readReply(conn, buf);             // 334
    w(btoa(user));
    await readReply(conn, buf);             // 334
    w(btoa(pass));
    await readReply(conn, buf);             // 235 authenticated
    w(`MAIL FROM:<${from}>`);
    await readReply(conn, buf);
    w(`RCPT TO:<${opts.to}>`);
    await readReply(conn, buf);
    w("DATA");
    await readReply(conn, buf);             // 354
    const headers =
      `From: ${from}\r\n` +
      `To: ${opts.to}\r\n` +
      `Subject: ${opts.subject}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
    w(headers + opts.html + "\r\n.");
    await readReply(conn, buf);             // 250 ok queued
    w("QUIT");
  } finally {
    conn.close();
  }
}
