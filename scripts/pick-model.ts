// npx tsx scripts/pick-model.ts
// Sets TF_MODEL in .env to a model configured in TrueForge (Settings → Models).
// Keeps the current TF_MODEL if it is configured; otherwise picks the strongest pinned model (Claude Sonnet, GPT-5, Gemini Pro, ...).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { client, die, ROOT } from "./lib.ts";

const envFile = join(ROOT, ".env");
const text = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const current = text.match(/^TF_MODEL=(.*)$/m)?.[1]?.trim() ?? "";

let names: string[] = [];
try {
  names = (await client().models.list()).data.map((m) => m.name);
} catch (e) {
  die(`Can't reach TrueForge. Is "1-start-trueforge" still running?\n  ${(e as Error).message}`);
}
if (!names.length) die("No models in TrueForge yet. Open http://localhost:8790 → Settings → Models and add the TrueFoundry gateway.");

// Strongest first, and a pinned version rather than "latest": every run must use the same model to be comparable.
const ranked = [/claude.*sonnet/i, /claude.*opus/i, /gpt-?5(?!.*(mini|nano))/i, /gemini.*pro/i, /claude/i, /gpt/i, /gemini.*flash/i];
const usable = names.filter((n) => !/latest|preview|lite|nano|image|tts|audio|embed|realtime/i.test(n));
const best = ranked.map((re) => usable.filter((n) => re.test(n)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]).find(Boolean);
const pick = names.includes(current) ? current : best ?? usable[0] ?? names[0];

const line = `TF_MODEL=${pick}`;
writeFileSync(envFile, /^TF_MODEL=.*$/m.test(text) ? text.replace(/^TF_MODEL=.*$/m, line) : `${text.trimEnd()}\n${line}\n`);
console.log(`✓ Using model ${pick}${pick === current ? "" : ` (available: ${names.join(", ")})`}`);
