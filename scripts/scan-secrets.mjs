#!/usr/bin/env node
/**
 * Secret scanner for RobloxOps.
 *
 * Scans every tracked file (and optionally the whole git history) for
 * credentials that must never reach a public repository.
 *
 * Usage:
 *   node scripts/scan-secrets.mjs            # tracked files (default, fast)
 *   node scripts/scan-secrets.mjs --history  # every blob in every commit
 *   node scripts/scan-secrets.mjs --all      # both
 *
 * Exit code 1 when something is found, so it can gate CI.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const scanHistory = args.has("--history") || args.has("--all");
const scanTree = !args.has("--history") || args.has("--all");

/** Files that may legitimately contain a pattern-shaped placeholder. */
const PLACEHOLDER_FILES = [/\.env\.example$/, /\.env\.local\.example$/, /^docs\//, /^README\.md$/];

/**
 * Values that look like a secret to a regex but are obviously fake.
 * Matched case-insensitively against the captured value.
 */
const PLACEHOLDER_VALUES = [
  /^(your|my|isi|ganti|masukkan)[-_ ]/i,
  /placeholder/i,
  /change[-_ ]?me/i,
  /^x{4,}$/i,
  /^\*{4,}$/,
  /^\.{3,}$/,
  /^<.*>$/,
  /^(dev|test|dummy|sample|example|fake)[-_]/i,
  /^dev-internal-token$/,
];

const RULES = [
  {
    id: "supabase-jwt",
    label: "Supabase JWT (anon/service role key)",
    // header.payload.signature — payload is long base64url
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    id: "stripe-secret",
    label: "Stripe secret / restricted key",
    re: /\b(sk|rk)_(live|test)_[0-9A-Za-z]{16,}/g,
  },
  {
    id: "stripe-webhook",
    label: "Stripe webhook signing secret",
    re: /\bwhsec_[0-9A-Za-z]{16,}/g,
  },
  {
    id: "github-token",
    label: "GitHub token",
    re: /\b(gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{30,})/g,
  },
  {
    id: "slack-token",
    label: "Slack token",
    re: /\bxox[abprs]-[0-9A-Za-z-]{10,}/g,
  },
  {
    id: "google-api-key",
    label: "Google / Gemini API key",
    re: /\bAIza[0-9A-Za-z_-]{30,}/g,
  },
  {
    id: "openai-key",
    label: "OpenAI-compatible API key",
    re: /\bsk-(proj-)?[A-Za-z0-9_-]{32,}/g,
  },
  {
    id: "discord-token",
    label: "Discord bot token",
    re: /\b[MNO][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{25,}/g,
  },
  {
    id: "private-key",
    label: "Private key block",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    // git grep speaks POSIX ERE: no non-capturing groups.
    ere: "-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----",
  },
  {
    id: "db-password-dsn",
    label: "Database DSN with an inline password",
    re: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:(?!\[)[^\s@/]{3,}@[^\s/]+/g,
    ere: "postgres(ql)?://[^[:space:]:@/]+:[^[:space:]@/]{3,}@[^[:space:]/]+",
    // Local development DSNs are fine; they never reach a real server.
    allow: /@(localhost|127\.0\.0\.1|db|postgres|host\.docker\.internal)[:/]/,
  },
  {
    id: "assigned-secret",
    label: "Hardcoded secret in an assignment",
    re: /(?:\b(?:api[_-]?key|secret|token|passwd|password|access[_-]?key)\b\s*[:=]\s*)(["'`])([^"'`\s]{16,})\1/gi,
    valueGroup: 2,
    // Only fire when the value really looks random, not a variable reference.
    require: (v) => /[A-Za-z]/.test(v) && /\d/.test(v) && !/\s/.test(v),
  },
];

/** Binary/lock/generated files we never want to read as text. */
const SKIP_FILE = [
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)\.git\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)\.venv\//,
  /(^|\/)coverage\//,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|mp4|woff2?|ttf|eot|tsbuildinfo)$/i,
];

const MAX_BYTES = 2 * 1024 * 1024;

function isPlaceholder(file, value) {
  if (!value) return false;
  if (PLACEHOLDER_VALUES.some((re) => re.test(value))) return true;
  // In example/docs files a short token-ish value is almost always a sample.
  if (PLACEHOLDER_FILES.some((re) => re.test(file)) && value.length < 24) return true;
  return false;
}

function scanText(file, text, origin) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.length > 4000) continue;
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(line)) !== null) {
        const value = rule.valueGroup ? match[rule.valueGroup] : match[0];
        if (!value) continue;
        if (rule.allow && rule.allow.test(value)) continue;
        if (isPlaceholder(file, value)) continue;
        if (rule.require && !rule.require(value)) continue;
        findings.push({
          rule: rule.id,
          label: rule.label,
          file,
          origin,
          line: i + 1,
          preview: redact(value),
        });
        break; // one hit per rule per line is enough
      }
    }
  }
  return findings;
}

function redact(value) {
  const v = value.trim();
  if (v.length <= 12) return `${v.slice(0, 3)}…`;
  return `${v.slice(0, 6)}…${v.slice(-4)} (${v.length} chars)`;
}

function trackedFiles() {
  // --cached: already committed or staged. --others --exclude-standard: new files
  // that git would add on the next commit (so the check works before `git add`).
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "buffer" },
  );
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((f) => !SKIP_FILE.some((re) => re.test(f)));
}

function scanWorkingTree() {
  const findings = [];
  let scanned = 0;
  for (const file of trackedFiles()) {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }
    if (size === 0 || size > MAX_BYTES) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue; // binary
    scanned += 1;
    findings.push(...scanText(file, text, "working tree"));
  }
  return { findings, scanned };
}

/**
 * git grep only understands POSIX ERE, so strip JS-only syntax when a rule
 * does not provide a hand-written `ere` variant.
 */
function ereOf(rule) {
  if (rule.ere) return rule.ere;
  return rule.re.source.replace(/\(\?:/g, "(");
}

/**
 * Walk every commit and grep the blobs it touched. We use `git grep` per
 * revision because it is far faster than reading objects one by one.
 */
function scanGitHistory() {
  const findings = [];
  let revs;
  try {
    revs = execFileSync("git", ["rev-list", "--all"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return { findings, scanned: 0 };
  }
  if (revs.length === 0) return { findings, scanned: 0 };

  const seen = new Set();
  for (const rule of RULES) {
    let out = "";
    try {
      out = execFileSync(
        "git",
        ["grep", "-n", "-I", "-E", "-e", ereOf(rule), ...revs, "--"],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
    } catch (err) {
      // exit 1 simply means "no match"
      if (err.status !== 1) throw err;
      out = err.stdout ? String(err.stdout) : "";
    }
    for (const line of out.split(/\r?\n/)) {
      if (!line) continue;
      const m = /^([0-9a-f]{7,40}):(.*?):(\d+):(.*)$/.exec(line);
      if (!m) continue;
      const [, rev, file, lineNo, body] = m;
      if (SKIP_FILE.some((re) => re.test(file))) continue;
      rule.re.lastIndex = 0;
      let hit;
      while ((hit = rule.re.exec(body)) !== null) {
        const value = rule.valueGroup ? hit[rule.valueGroup] : hit[0];
        if (!value) continue;
        if (rule.allow && rule.allow.test(value)) continue;
        if (isPlaceholder(file, value)) continue;
        if (rule.require && !rule.require(value)) continue;
        const key = `${rule.id}:${file}:${redact(value)}`;
        if (seen.has(key)) break;
        seen.add(key);
        findings.push({
          rule: rule.id,
          label: rule.label,
          file,
          origin: `commit ${rev.slice(0, 8)}`,
          line: Number(lineNo),
          preview: redact(value),
        });
        break;
      }
    }
  }
  return { findings, scanned: revs.length };
}

function report(title, result) {
  console.log(`\n${title} — ${result.scanned} scanned`);
  if (result.findings.length === 0) {
    console.log("  OK: no secrets found");
    return 0;
  }
  for (const f of result.findings) {
    console.log(`  ✗ [${f.rule}] ${f.file}:${f.line} (${f.origin})`);
    console.log(`      ${f.label}: ${f.preview}`);
  }
  console.log(`  ${result.findings.length} finding(s)`);
  return result.findings.length;
}

let total = 0;
if (scanTree) total += report("Tracked files", scanWorkingTree());
if (scanHistory) total += report("Git history", scanGitHistory());

if (total > 0) {
  console.error(
    "\nFAILED: potential secrets detected. Remove them, rotate the credential,\n" +
      "and if they were ever committed rewrite history before pushing.\n",
  );
  process.exit(1);
}
console.log("\nPASSED: repository is clean.\n");
