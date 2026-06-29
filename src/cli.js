#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts";

function printHelp() {
  console.log(`volc-tts - Volcengine / Doubao text-to-speech CLI

Usage:
  volc-tts "要合成的文本" -o out.mp3
  volc-tts --text "要合成的文本" --out out.wav --encoding wav
  volc-tts --input script.txt --out out.mp3

Required config:
  VOLC_TTS_APP_ID       or --app-id
  VOLC_TTS_TOKEN        or --token
  VOLC_TTS_VOICE_TYPE   or --voice

Options:
  -t, --text <text>              Text to synthesize
  -i, --input <file>             Read text from a UTF-8 file
  -o, --out <file>               Output audio path
      --stdout                   Write audio bytes to stdout
      --voice <voice_type>       Voice type / voice ID
      --app-id <appid>           Volcengine TTS app ID
      --token <token>            Volcengine TTS access token
      --cluster <cluster>        TTS cluster, default: volcano_tts
      --endpoint <url>           TTS endpoint, default: ${DEFAULT_ENDPOINT}
      --resource-id <id>         Optional API resource ID header for newer endpoints
      --uid <uid>                User ID in request payload, default: volc-tts-cli
      --encoding <format>        mp3, wav, pcm, ogg_opus, default: mp3
      --speed <number>           Speed ratio, default: 1
      --volume <number>          Volume ratio, default: 1
      --pitch <number>           Pitch ratio, default: 1
      --rate <number>            Sample rate, for example 24000
      --language <lang>          Optional language code
      --emotion <emotion>        Optional emotion/style field when supported
      --operation <operation>    Request operation, default: query
      --audio-json <json>        Merge extra JSON into payload.audio
      --request-json <json>      Merge extra JSON into payload.request
      --app-json <json>          Merge extra JSON into payload.app
      --header <name:value>      Add a custom HTTP header; repeatable
      --env-file <file>          Load env file, default: .env when present
      --dry-run                  Print the request with secrets redacted
  -h, --help                     Show help
      --version                  Show version

Examples:
  volc-tts "今天这期主要看几个 AI 开发工具。" -o speech.mp3
  volc-tts --input script.txt --voice zh_female_xxx --encoding wav -o speech.wav
`);
}

function parseArgs(argv) {
  const options = {
    headers: [],
    positional: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return argv[i];
    };

    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--version":
        options.version = true;
        break;
      case "-t":
      case "--text":
        options.text = next();
        break;
      case "-i":
      case "--input":
        options.input = next();
        break;
      case "-o":
      case "--out":
        options.out = next();
        break;
      case "--stdout":
        options.stdout = true;
        break;
      case "--voice":
        options.voice = next();
        break;
      case "--app-id":
        options.appId = next();
        break;
      case "--token":
        options.token = next();
        break;
      case "--cluster":
        options.cluster = next();
        break;
      case "--endpoint":
        options.endpoint = next();
        break;
      case "--resource-id":
        options.resourceId = next();
        break;
      case "--uid":
        options.uid = next();
        break;
      case "--encoding":
        options.encoding = next();
        break;
      case "--speed":
        options.speed = Number(next());
        break;
      case "--volume":
        options.volume = Number(next());
        break;
      case "--pitch":
        options.pitch = Number(next());
        break;
      case "--rate":
        options.rate = Number(next());
        break;
      case "--language":
        options.language = next();
        break;
      case "--emotion":
        options.emotion = next();
        break;
      case "--operation":
        options.operation = next();
        break;
      case "--audio-json":
        options.audioJson = parseJsonOption(arg, next());
        break;
      case "--request-json":
        options.requestJson = parseJsonOption(arg, next());
        break;
      case "--app-json":
        options.appJson = parseJsonOption(arg, next());
        break;
      case "--header":
        options.headers.push(next());
        break;
      case "--env-file":
        options.envFile = next();
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.positional.push(arg);
        break;
    }
  }

  return options;
}

function parseJsonOption(name, value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(`${name} must be a JSON object: ${error.message}`);
  }
}

async function loadEnvFile(path) {
  if (!path || !existsSync(path)) return;
  const content = await readFile(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnv(rawValue.trim());
  }
}

function unquoteEnv(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function envOrOption(optionValue, envName, fallback = undefined) {
  return optionValue ?? process.env[envName] ?? fallback;
}

function assertFiniteNumber(name, value) {
  if (value === undefined) return;
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
}

async function getText(options) {
  if (options.text) return options.text;
  if (options.input) return (await readFile(options.input, "utf8")).trim();
  if (options.positional.length > 0) return options.positional.join(" ");
  throw new Error("Text is required. Pass a positional text, --text, or --input.");
}

function buildHeaders(token, options) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer;${token}`,
  };

  if (options.resourceId) {
    headers["X-Api-Resource-Id"] = options.resourceId;
    headers["Resource-Id"] = options.resourceId;
  }

  for (const header of options.headers ?? []) {
    const index = header.indexOf(":");
    if (index <= 0) throw new Error(`Invalid --header value: ${header}`);
    const name = header.slice(0, index).trim();
    const value = header.slice(index + 1).trim();
    if (!name || !value) throw new Error(`Invalid --header value: ${header}`);
    headers[name] = value;
  }

  return headers;
}

function buildPayload(text, config, options) {
  const audio = {
    voice_type: config.voice,
    encoding: config.encoding,
    speed_ratio: config.speed,
    volume_ratio: config.volume,
    pitch_ratio: config.pitch,
  };

  if (options.rate !== undefined) audio.rate = options.rate;
  if (options.language) audio.language = options.language;
  if (options.emotion) audio.emotion = options.emotion;

  return {
    app: {
      appid: config.appId,
      token: config.token,
      cluster: config.cluster,
      ...(options.appJson ?? {}),
    },
    user: {
      uid: config.uid,
    },
    audio: {
      ...audio,
      ...(options.audioJson ?? {}),
    },
    request: {
      reqid: randomUUID(),
      text,
      operation: config.operation,
      ...(options.requestJson ?? {}),
    },
  };
}

function redact(value) {
  if (!value) return value;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function redactRequest(headers, payload) {
  return {
    headers: {
      ...headers,
      Authorization: headers.Authorization ? "Bearer;****" : undefined,
    },
    payload: {
      ...payload,
      app: {
        ...payload.app,
        token: redact(payload.app.token),
      },
    },
  };
}

function validateConfig(config, options) {
  const missing = [];
  if (!config.appId) missing.push("VOLC_TTS_APP_ID or --app-id");
  if (!config.token) missing.push("VOLC_TTS_TOKEN or --token");
  if (!config.voice) missing.push("VOLC_TTS_VOICE_TYPE or --voice");
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }

  assertFiniteNumber("--speed", options.speed);
  assertFiniteNumber("--volume", options.volume);
  assertFiniteNumber("--pitch", options.pitch);
  assertFiniteNumber("--rate", options.rate);
}

async function writeAudio(buffer, options, encoding) {
  if (options.stdout) {
    process.stdout.write(buffer);
    return;
  }

  const outPath = resolve(options.out ?? `speech.${extensionForEncoding(encoding)}`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buffer);
  console.error(`Wrote ${outPath} (${buffer.length} bytes)`);
}

function extensionForEncoding(encoding) {
  if (encoding === "ogg_opus") return "ogg";
  if (encoding === "pcm" || encoding === "raw") return "pcm";
  return encoding || "mp3";
}

async function parseTtsResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = Buffer.from(await response.arrayBuffer());
  const text = raw.toString("utf8");

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  if (contentType.includes("application/json") || looksLikeJson(text)) {
    const json = JSON.parse(text);
    if (json.code !== undefined && json.code !== 3000) {
      throw new Error(`TTS failed: code=${json.code} message=${json.message ?? text}`);
    }
    if (typeof json.data !== "string") {
      throw new Error(`TTS response has no base64 data: ${text}`);
    }
    return Buffer.from(json.data, "base64");
  }

  return raw;
}

function looksLikeJson(text) {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.version) {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    console.log(pkg.version);
    return;
  }

  await loadEnvFile(options.envFile ?? ".env");

  const text = await getText(options);
  const config = {
    appId: envOrOption(options.appId, "VOLC_TTS_APP_ID"),
    token: envOrOption(options.token, "VOLC_TTS_TOKEN"),
    voice: envOrOption(options.voice, "VOLC_TTS_VOICE_TYPE"),
    cluster: envOrOption(options.cluster, "VOLC_TTS_CLUSTER", "volcano_tts"),
    endpoint: envOrOption(options.endpoint, "VOLC_TTS_ENDPOINT", DEFAULT_ENDPOINT),
    resourceId: envOrOption(options.resourceId, "VOLC_TTS_RESOURCE_ID"),
    uid: envOrOption(options.uid, "VOLC_TTS_UID", "volc-tts-cli"),
    encoding: envOrOption(options.encoding, "VOLC_TTS_ENCODING", "mp3"),
    speed: options.speed ?? Number(process.env.VOLC_TTS_SPEED ?? 1),
    volume: options.volume ?? Number(process.env.VOLC_TTS_VOLUME ?? 1),
    pitch: options.pitch ?? Number(process.env.VOLC_TTS_PITCH ?? 1),
    operation: envOrOption(options.operation, "VOLC_TTS_OPERATION", "query"),
  };
  options.resourceId = config.resourceId;

  validateConfig(config, options);

  const payload = buildPayload(text, config, options);
  const headers = buildHeaders(config.token, options);

  if (options.dryRun) {
    console.log(JSON.stringify(redactRequest(headers, payload), null, 2));
    return;
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const audio = await parseTtsResponse(response);
  await writeAudio(audio, options, config.encoding);
}

main().catch((error) => {
  console.error(`volc-tts: ${error.message}`);
  process.exitCode = 1;
});
