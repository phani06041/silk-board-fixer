// npm run improve [-- --run NN] [-- --coach] [-- --no-commit]
//
// The agent reads how its signal plans did in a run and rewrites its own instructions and playbook.
//   1. Takes the run's training scenarios (never the holdout ones) with the simulator's report for each.
//   2. Opens a TrueForge session with the agent itself (or, with --coach, an inline coach agent on the same model)
//      and asks it for new versions of agent/instructions.md and agent/skills/*/SKILL.md.
//   3. Writes the files and commits them with the trailer "Agent-Session: <session_id>".
// You review the commit (git show) and keep it or drop it (git reset --hard HEAD~1). You don't edit it.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { report, scoreTask, type TaskScore } from "../evals/score.ts";
import {
  client,
  die,
  exportSession,
  flag,
  git,
  isClean,
  loadTasks,
  taskPrompt,
  option,
  readAgent,
  ROOT,
  runDir,
  runTurn,
  SUMMARY_CSV,
  writeJson,
} from "./lib.ts";

// ---------- which run ----------

const rows = existsSync(SUMMARY_CSV) ? readFileSync(SUMMARY_CSV, "utf8").trim().split("\n").slice(1).filter(Boolean) : [];
if (!rows.length) die("No runs yet. Run npm run run-evals first.");
const run = Number(option("run") ?? rows.length);
const dir = runDir(run);
const nn = String(run).padStart(2, "0");
if (!existsSync(join(dir, "results.json"))) die(`No results for run ${nn} in ${dir}`);
if (!isClean("agent")) die("agent/ has uncommitted changes. Commit or discard them first: the agent's change must be its own.");

type Result = TaskScore & { reply: string };
const results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8")) as Result[];
const tasks = new Map(loadTasks().map((t) => [t.id, t]));
const training = results.filter((r) => !r.holdout);
const failed = training.filter((r) => !r.passed);
if (!failed.length) {
  console.log(`Nothing to learn from run ${nn}: every training scenario passed. Add harder scenarios before run 1 next time.`);
  process.exit(0);
}

// ---------- the prompt ----------

const { agent, instructions, skills } = readAgent();
const currentFiles = [
  { path: "agent/instructions.md", text: instructions },
  ...skills.map((s) => ({ path: `${s.path}/SKILL.md`, text: readFileSync(join(ROOT, s.path, "SKILL.md"), "utf8") })),
];

const feedback = training
  .sort((x, y) => x.score - y.score)
  .map((r) => {
    const t = tasks.get(r.task_id)!;
    const again = scoreTask(t, r.reply); // deterministic: same numbers as the run
    return [
      `### Scenario: ${t.title}: score ${r.score.toFixed(2)}${r.passed ? " (passed)" : ""}`,
      taskPrompt(t).split("\n").filter((l) => l.startsWith("|") || l.startsWith("- **")).join("\n"),
      "",
      "What happened with your plan:",
      report(t, again),
    ].join("\n");
  })
  .join("\n\n");

const prompt = `This message is not a junction to plan. Ignore the Output section of your instructions for this reply.

You are improving your own playbook. Below are your current instruction files, then what happened when the simulator ran your signal plans for the training scenarios in your last run: per window and approach, how many vehicles arrived and got through, how long they waited, the longest queue, and how fast each approach really discharged.

Rewrite your files so that your next plans cut the average wait. Look for what the numbers say about this junction and about signal timing: which approaches move slower than their lane count suggests, whether your cycles were too short or too long, where queues built up or carried over between windows, and where green time was wasted.

Rules:
- Write rules that will help on scenarios you have never seen at this junction (other times of day, weather, closures): what you learned about each approach, and how to size cycles and greens. Never copy a scenario's arrival numbers or a plan; never name a scenario.
- Keep what works. Change only what the failures show is wrong or missing. Keep the Output section of instructions.md exactly as it is: the scorer depends on it.
- Short beats long: one line per rule, with numbers where they help (e.g. a measured flow per lane, a cycle length range). A short worked method (steps to compute greens) is welcome.
- You may edit agent/instructions.md and any agent/skills/<name>/SKILL.md (keep the frontmatter). Leave out files you don't change.

Reply with each changed file in full, in this format, and nothing else:

<<<FILE agent/skills/signal-playbook/SKILL.md
(the whole new file)
>>>
<<<LEARNED
(one sentence: what you learned)
>>>

## Your current files

${currentFiles.map((f) => `<<<FILE ${f.path}\n${f.text.trim()}\n>>>`).join("\n\n")}

## What went wrong in run ${nn}

${feedback}
`;

// ---------- ask the agent ----------

const tf = client();
const coach = flag("coach");
const { data: session } = await tf.sessions.create({
  // The agent itself (by name), or a coach: an inline TrueForge agent on the same model.
  agent: coach
    ? { spec: { model: agent.model, instructions: "You coach a traffic-signal planning agent: you rewrite its instruction files from its simulator reports.", config: { askUserQuestions: { enabled: false }, generativeUi: { enabled: false } } } }
    : { name: agent.name },
  metadata: { purpose: "improve", learned_from_run: nn },
});
await tf.sessions.update(session.id, { title: `improve from run ${nn}` });
console.log(`Asking ${coach ? "the coach" : `"${agent.name}"`} to rewrite its playbook from ${failed.length} failed tasks (session ${session.id})…`);

const turn = await runTurn(tf, session.id, prompt, false);
if (turn.status !== "done") die(`The turn ended with status ${turn.status}${turn.error ? `: ${turn.error}` : ""}`);

// ---------- parse and check the change ----------

const files = [...turn.text.matchAll(/<<<FILE ([^\n]+)\n([\s\S]*?)\n>>>/g)].map((m) => ({ path: normalize(m[1].trim()), text: m[2].trimEnd() + "\n" }));
const learned = turn.text.match(/<<<LEARNED\n([\s\S]*?)\n>>>/)?.[1].trim() ?? "";
if (!files.length) die(`The agent proposed no files. Its reply:\n\n${turn.text}`);

const allowed = /^agent\/(instructions\.md|skills\/[a-z0-9][a-z0-9-]*\/SKILL\.md)$/;
for (const f of files) {
  if (!allowed.test(f.path)) die(`The agent tried to write ${f.path}. Only agent/instructions.md and agent/skills/<name>/SKILL.md are allowed.`);
}

// Overfitting guard: the new playbook must not quote the eval tasks.
const leaks: string[] = [];
const chunks = (text: string) => {
  const out: string[] = [];
  for (let i = 0; i + 28 <= text.length; i += 7) out.push(text.slice(i, i + 28));
  return out;
};
for (const t of loadTasks()) {
  const quotes = [t.id, t.title, ...chunks(t.description)];
  for (const f of files) for (const q of quotes) if (f.text.includes(q)) { leaks.push(`${f.path} quotes "${q}"`); break; }
}
if (leaks.length && !flag("allow-leaks")) die(`The change quotes the eval tasks, so it would overfit:\n  ${leaks.join("\n  ")}\nRun improve again (or pass --allow-leaks to keep it anyway).`);

for (const f of files.filter((f) => f.path.endsWith("/SKILL.md"))) {
  if (!/^---\n[\s\S]*?\bname:[\s\S]*?\bdescription:[\s\S]*?\n---\n/.test(f.text) || f.text.split("\n").length < 6) {
    die(`${f.path} lost its frontmatter (name, description) or its body. Run improve again.`);
  }
}
const newInstructions = files.find((f) => f.path === "agent/instructions.md");
if (newInstructions && !newInstructions.text.includes('"plan"')) {
  die("The new instructions.md dropped the JSON output format the scorer needs. Run improve again.");
}

// ---------- write and commit ----------

for (const f of files) {
  mkdirSync(dirname(join(ROOT, f.path)), { recursive: true });
  writeFileSync(join(ROOT, f.path), f.text);
}
writeJson(join(dir, "improve-session.json"), await exportSession(tf, session.id));

if (isClean("agent")) {
  console.log("The agent sent back its files unchanged. Nothing to commit.");
  process.exit(0);
}
console.log(git("diff", "--stat", "--", "agent"));

const message = `agent: learn from run ${nn}\n\n${learned || "(no summary given)"}\n\nAgent-Session: ${session.id}`;
if (flag("no-commit")) {
  console.log(`\nFiles written, not committed. To commit:\n  git add agent runs && git commit -F- <<'EOF'\n${message}\nEOF`);
} else {
  git("add", "agent", join(dir, "improve-session.json"));
  git("commit", "-q", "-m", message);
  console.log(`\n✓ Committed the agent's change (Agent-Session: ${session.id}).`);
  console.log("  Review it: git show    Drop it: git reset --hard HEAD~1    Then: npm run run-evals");
}
