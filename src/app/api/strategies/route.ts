import { BUILTIN_STRATEGIES, discoverPlugins } from "@/lib/strategies";

import { checkRateLimit } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = checkRateLimit(req, "read");
  if (denied) return Response.json(denied.body, { status: denied.status });
  const plugins = await discoverPlugins();
  return Response.json({
    builtins: BUILTIN_STRATEGIES,
    plugins: plugins.map(({ def, file }) => ({ ...def, file })),
  });
}
