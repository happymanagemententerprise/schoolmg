// CORS for browser-invoked edge functions. Webhook and push-dispatch are
// server/scheduler-invoked and don't need CORS, but applying it is harmless.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
