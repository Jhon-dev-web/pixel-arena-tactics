// Type-check shim only: the real `Deno` global exists in the Supabase Edge runtime. This file is never loaded by Deno (nothing imports it).
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};
