type Handler = (req: any, res: any, next: (error?: unknown) => void) => unknown;

/** Small Express-compatible adapter for the existing campus routes on Deno. */
export function createApp() {
  const middleware: Handler[] = [];
  const routes: { method: string; path: string; handlers: Handler[] }[] = [];
  const app: any = {
    disable() { return app; },
    use(handler: Handler) { middleware.push(handler); return app; },
    get(path: string, ...handlers: Handler[]) { routes.push({ method: 'GET', path, handlers }); return app; },
    post(path: string, ...handlers: Handler[]) { routes.push({ method: 'POST', path, handlers }); return app; },
    delete(path: string, ...handlers: Handler[]) { routes.push({ method: 'DELETE', path, handlers }); return app; },
    listen() {
      return Deno.serve((request) => dispatch(request, middleware, routes));
    },
  };
  return app;
}

export function jsonBody(_options: { limit?: string } = {}): Handler {
  return async (req, _res, next) => {
    const text = await req.raw.text();
    if (text.length > 65_536) return req.res.status(413).json({ error: 'Request body is too large.' });
    if (!text) req.body = {};
    else {
      try { req.body = JSON.parse(text); }
      catch { return req.res.status(400).json({ error: 'Invalid JSON request body.' }); }
    }
    next();
  };
}

async function dispatch(request: Request, middleware: Handler[], routes: { method: string; path: string; handlers: Handler[] }[]) {
  const url = new URL(request.url);
  // Hosted Edge Function requests can include either gateway path or function mount path;
  // local `serve` requests start directly at the application route.
  const pathname = url.pathname.replace(/^(?:\/functions\/v1)?\/campus-api(?=\/|$)/, '') || '/';
  const route = routes.find(candidate => candidate.method === request.method && match(candidate.path, pathname));
  const params = route ? match(route.path, pathname) || {} : {};
  let status = 200;
  const headers = new Headers();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let responseSent!: (response: Response) => void;
  let responseCreated = false;
  const responsePromise = new Promise<Response>(resolve => { responseSent = resolve; });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() { closeListeners.forEach(listener => listener()); },
  });
  const closeListeners: (() => void)[] = [];
  const createResponse = (body: ReadableStream<Uint8Array> | null = stream) => {
    if (responseCreated) return;
    responseCreated = true;
    responseSent(new Response(status === 204 || status === 304 ? null : body, { status, headers }));
  };
  const res: any = {
    status(code: number) { status = code; return res; },
    setHeader(name: string, value: string) { if (name.toLowerCase() !== 'connection') headers.set(name, value); },
    flushHeaders() { createResponse(); },
    write(chunk: string) { if (!responseCreated) createResponse(); controller?.enqueue(encoder.encode(chunk)); return true; },
    on(event: string, listener: () => void) { if (event === 'close') closeListeners.push(listener); },
    json(value: unknown) { headers.set('Content-Type', 'application/json; charset=utf-8'); if (status !== 204) controller?.enqueue(encoder.encode(JSON.stringify(value))); createResponse(); controller?.close(); return res; },
    sendStatus(code: number) { status = code; createResponse(null); controller?.close(); return res; },
    end() { createResponse(null); controller?.close(); return res; },
  };
  const req: any = {
    raw: request, method: request.method, url: request.url, path: url.pathname,
    headers: Object.fromEntries(request.headers.entries()), params, query: Object.fromEntries(url.searchParams.entries()),
    ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown',
    body: {}, res,
  };
  const errorHandlers = middleware.filter(handler => handler.length === 4) as any[];
  const normalMiddleware = middleware.filter(handler => handler.length !== 4);
  const handlers = [...normalMiddleware, ...(route?.handlers || [])];
  let index = -1;
  const next = async (error?: unknown): Promise<void> => {
    if (error) {
      const handler = errorHandlers[0];
      if (handler) await handler(error, req, res, () => {});
      else { console.error('[campus-api]', error); res.status(500).json({ error: 'The request could not be completed.' }); }
      return;
    }
    index += 1;
    if (index >= handlers.length) return;
    try { await handlers[index](req, res, next); }
    catch (err) { await next(err); }
  };
  if (!route && request.method !== 'OPTIONS') return Response.json({ error: 'Route not found.' }, { status: 404 });
  void next();
  const timeout = new Promise<Response>(resolve => setTimeout(() => resolve(Response.json({ error: 'Request timed out.' }, { status: 504 })), 115_000));
  return await Promise.race([responsePromise, timeout]);
}

function match(pattern: string, pathname: string): Record<string, string> | null {
  const names: string[] = [];
  const source = pattern.split('/').map(part => {
    if (part.startsWith(':')) { names.push(part.slice(1)); return '([^/]+)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  const found = new RegExp(`^${source}/?$`).exec(pathname);
  return found ? Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(found[index + 1])])) : null;
}
