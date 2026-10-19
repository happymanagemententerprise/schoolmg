// Retired: all sign-in must go through Supabase Auth.
Deno.serve((_request) => new Response(
  JSON.stringify({ error: 'This endpoint has been retired.' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } },
));
