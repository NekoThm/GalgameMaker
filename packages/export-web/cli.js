import { exportWeb } from "./exporter.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const projectArg = args.project ?? args.p;
  const outArg = args.out ?? args.o;

  if (!projectArg || !outArg) {
    console.error("Usage: node \"packages/export-web/cli.js\" --project \"examples/MyGame\" --out \"dist/web\"");
    process.exit(1);
  }

  const { outDir, ir, manifest } = await exportWeb({
    projectDir: projectArg,
    outDir: outArg
  });

  console.log(`[export-web] OK -> ${outDir}`);
  console.log(`[export-web] Project: ${ir.project.title} (${ir.project.id})`);
  console.log(`[export-web] Assets: ${manifest.assets.length}`);
}

main().catch((e) => {
  const msg = e?.diagnostics ? "Compile failed with errors (see diagnostics below)" : "Export failed";
  console.error(`[export-web] ${msg}`);
  if (e?.diagnostics) {
    for (const d of e.diagnostics) {
      console.error(`- [${d.level}] ${d.code}: ${d.message}${d.sceneId ? ` (scene=${d.sceneId}` : ""}${d.nodeId ? ` node=${d.nodeId}` : ""}${d.sceneId ? ")" : ""}`);
    }
  }
  console.error(e);
  process.exit(1);
});
