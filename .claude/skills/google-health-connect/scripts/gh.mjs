#!/usr/bin/env node
// Google Health CLI. Node >= 18, no dependencies.
//
//   node gh.mjs import-client <downloaded-client.json> [--source own-project|shared-app]
//   <page text> | node gh.mjs import-client-text [--source ...]   # parse id+secret from stdin, never prints the secret
//   node gh.mjs login [--hint you@gmail.com] [--scopes read|write|all] [--no-browser]
//   node gh.mjs status
//   node gh.mjs doctor
//   node gh.mjs token                     # prints a valid access token (for curl)
//   node gh.mjs logout                    # revokes and deletes the local token
//   node gh.mjs get <path> [k=v ...]      # e.g. get users/me/pairedDevices
//   node gh.mjs post <path> '<json>'
//   node gh.mjs list <dataType> ['<AIP-160 filter>'] [--all]
//   node gh.mjs daily <dataType> <YYYY-MM-DD> <YYYY-MM-DD>   # end date exclusive
//
// Env: GOOGLE_HEALTH_DIR (default ~/.config/google-health)

import * as gh from "./lib/google-health.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const VALUE_FLAGS = new Set(["--hint", "--scopes", "--source"]);
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith("--") && !VALUE_FLAGS.has(arr[i - 1]));
const print = (x) => console.log(typeof x === "string" ? x : JSON.stringify(x, null, 2));

function scopesFor(kind = "read") {
  if (kind === "read") return gh.READ_SCOPES;
  if (kind === "write") return gh.WRITE_SCOPES;
  if (kind === "all") return [...gh.READ_SCOPES, ...gh.WRITE_SCOPES];
  return kind.split(",").map((s) => (s.startsWith("https://") ? s : `https://www.googleapis.com/auth/googlehealth.${s}`));
}

async function main() {
  switch (cmd) {
    case "import-client":
      print(gh.importClient(positional[0], { source: opt("source") || "own-project" }));
      print(`Saved to ${gh.configDir()}/client.json (0600)`);
      break;
    case "import-client-text": {
      // Reads page text from stdin, e.g.: agent-browser --cdp 9222 get text body | node gh.mjs import-client-text
      const chunks = [];
      for await (const c of process.stdin) chunks.push(c);
      print(gh.importClientFromText(Buffer.concat(chunks).toString("utf8"), { source: opt("source") || "own-project" }));
      print(`Saved to ${gh.configDir()}/client.json (0600)`);
      break;
    }
    case "login": {
      const status = await gh.login({
        scopes: scopesFor(opt("scopes")),
        loginHint: opt("hint"),
        openBrowser: !flag("no-browser"),
        onAuthUrl: (url) => console.log(`AUTH_URL ${url}`),
      });
      print(status);
      break;
    }
    case "status": print(gh.tokenStatus()); break;
    case "doctor": {
      const checks = await gh.doctor();
      for (const c of checks) console.log(`${c.ok ? "OK  " : "FAIL"} ${c.name}: ${c.info}`);
      process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
      break;
    }
    case "token": print(await gh.getAccessToken()); break;
    case "logout": await gh.logout(); print("Token revoked and deleted."); break;
    case "get": {
      const params = Object.fromEntries(positional.slice(1).map((kv) => kv.split(/=(.*)/s).slice(0, 2)));
      print(await gh.api("GET", positional[0], { params }));
      break;
    }
    case "post": print(await gh.api("POST", positional[0], { body: positional[1] ? JSON.parse(positional[1]) : {} })); break;
    case "list": print(await gh.listDataPoints(positional[0], { filter: positional[1], all: flag("all") })); break;
    case "daily": print(await gh.dailyRollUp(positional[0], positional[1], positional[2])); break;
    default:
      console.log((await import("node:fs")).readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n"));
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e) => {
  console.error(`${e.code ? `[${e.code}] ` : ""}${e.message}`);
  process.exitCode = 2;
});
