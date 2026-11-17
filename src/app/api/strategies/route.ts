import { BUILTIN_STRATEGIES, discoverPlugins } from "@/lib/strategies";

export const dynamic = "force-dynamic";

export async function GET() {
  const plugins = await discoverPlugins();
  return Response.json({
    builtins: BUILTIN_STRATEGIES,
    plugins: plugins.map(({ def, file }) => ({ ...def, file })),
  });
}
