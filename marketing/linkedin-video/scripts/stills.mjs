// Renders review frames: node scripts/stills.mjs <lang> <compositionId:frame>...
// Example: node scripts/stills.mjs pt Hook:160 Gates:185 MaverickPromo-PT:0
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const [lang = "pt", ...targets] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const inputProps = { lang };

for (const target of targets) {
  const [id, frame] = target.split(":");
  const composition = await selectComposition({ serveUrl, id, inputProps });
  const output = path.resolve(`out/stills/${lang}-${id}-${frame}.png`);
  await renderStill({
    serveUrl,
    composition,
    frame: Number(frame),
    output,
    inputProps,
  });
  console.log(output);
}
