// Retired: sensitive actions now reauthenticate through Supabase Auth in the
// client. Deploy this handler to invalidate any previously deployed oracle.
Deno.serve((_request) => new Response(
  JSON.stringify({ error: 'This endpoint has been retired.' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } },
));
