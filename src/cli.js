#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";

const DEFAULT_ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts";
const DEFAULT_V3_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const DEFAULT_V3_RESOURCE_ID = "seed-tts-2.0";
const DEFAULT_V3_VOICE = "zh_female_xiaohe_uranus_bigtts";
const CONFIG_FILE_NAME = "config.json";

function printHelp() {
  console.log(`volc-tts - Volcengine / Doubao text-to-speech CLI

Usage:
  volc-tts "要合成的文本" -o out.mp3
  volc-tts --text "要合成的文本" --out out.wav --encoding wav
  volc-tts --input script.txt --out out.mp3
  volc-tts auth login
  volc-tts auth status
  volc-tts auth logout

Required config:
  New API-key mode: VOLC_TTS_API_KEY or --api-key
  Legacy mode:      VOLC_TTS_APP_ID + VOLC_TTS_TOKEN, or --app-id + --token
  Voice:            VOLC_TTS_VOICE_TYPE or --voice
  Or run: volc-tts auth login

Options:
  -t, --text <text>              Text to synthesize
  -i, --input <file>             Read text from a UTF-8 file
  -o, --out <file>               Output audio path
      --stdout                   Write audio bytes to stdout
      --voice <voice_type>       Voice type / voice ID
      --api-key <key>            Volcengine / Doubao speech API key
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
      --model <model>            Optional v3 model, for example seed-tts-2.0-expressive
      --context <text>           v3 voice instruction/context_texts; repeatable
      --section-id <id>          v3 section ID for cross-request semantic continuity
      --tag-parser               Enable v3 voice tag parser when supported
      --speech-rate <int>        v3 speech rate, range -50..100
      --loudness-rate <int>      v3 loudness rate, range -50..100
      --pitch-rate <int>         v3 pitch rate
      --emotion-scale <number>   Optional v3 emotion strength when supported
      --operation <operation>    Request operation, default: query
      --audio-json <json>        Merge extra JSON into payload.audio
      --request-json <json>      Merge extra JSON into payload.request
      --app-json <json>          Merge extra JSON into payload.app
      --header <name:value>      Add a custom HTTP header; repeatable
      --config <file>            Auth config path, default: ~/.config/volc-tts-cli/config.json
      --env-file <file>          Load env file, default: .env when present
      --dry-run                  Print the request with secrets redacted
  -h, --help                     Show help
      --version                  Show version

Examples:
  volc-tts auth login --api-key your_api_key --voice ${DEFAULT_V3_VOICE}
  volc-tts auth login --app-id appid --token token --voice voice_type
  volc-tts "今天这期主要看几个 AI 开发工具。" -o speech.mp3
  volc-tts --input script.txt --voice zh_female_xxx --encoding wav -o speech.wav
`);
}

function parseArgs(argv) {
  const options = {
    headers: [],
    contexts: [],
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
      case "--api-key":
        options.apiKey = next();
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
      case "--model":
        options.model = next();
        break;
      case "--emotion-scale":
        options.emotionScale = Number(next());
        break;
      case "--speech-rate":
        options.speechRate = Number(next());
        break;
      case "--loudness-rate":
        options.loudnessRate = Number(next());
        break;
      case "--pitch-rate":
        options.pitchRate = Number(next());
        break;
      case "--context":
        options.contexts.push(next());
        break;
      case "--section-id":
        options.sectionId = next();
        break;
      case "--tag-parser":
        options.tagParser = true;
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
      case "--config":
        options.config = next();
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

function configuredValue(optionValue, envName, configValue, fallback = undefined) {
  return optionValue ?? process.env[envName] ?? configValue ?? fallback;
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

function buildHeaders(config, options) {
  const headers = { "Content-Type": "application/json" };

  if (config.authMode === "api-key") {
    headers["X-Api-Key"] = config.apiKey;
    headers["X-Api-Request-Id"] = randomUUID();
  } else {
    headers.Authorization = `Bearer;${config.token}`;
  }

  if (config.resourceId) {
    headers["X-Api-Resource-Id"] = config.resourceId;
    headers["Resource-Id"] = config.resourceId;
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
  if (config.authMode === "api-key") {
    return buildApiKeyPayload(text, config, options);
  }

  return buildLegacyPayload(text, config, options);
}

function buildLegacyPayload(text, config, options) {
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

function buildApiKeyPayload(text, config, options) {
  const audioParams = {
    format: normalizeV3Encoding(config.encoding),
    sample_rate: options.rate ?? 24000,
  };

  if (config.speed !== 1) audioParams.speech_rate = config.speed;
  if (config.volume !== 1) audioParams.volume = config.volume;
  if (config.pitch !== 1) audioParams.pitch_rate = config.pitch;
  if (options.speechRate !== undefined) audioParams.speech_rate = options.speechRate;
  if (options.loudnessRate !== undefined) audioParams.loudness_rate = options.loudnessRate;
  if (options.pitchRate !== undefined) audioParams.pitch_rate = options.pitchRate;
  if (options.emotionScale !== undefined) audioParams.emotion_scale = options.emotionScale;
  Object.assign(audioParams, options.audioJson ?? {});

  const additions = {
    disable_markdown_filter: true,
  };
  if (options.contexts.length > 0) {
    additions.context_texts = options.contexts;
  }
  if (options.sectionId) {
    additions.section_id = options.sectionId;
  }
  if (options.tagParser) {
    additions.use_tag_parser = true;
  }

  return {
    user: {
      uid: config.uid,
    },
    req_params: {
      text,
      speaker: config.voice,
      audio_params: audioParams,
      additions: JSON.stringify(additions),
      ...(options.model ? { model: options.model } : {}),
      ...(options.language ? { language: options.language } : {}),
      ...(options.emotion ? { emotion: options.emotion } : {}),
      ...(options.requestJson ?? {}),
    },
  };
}

function normalizeV3Encoding(encoding) {
  if (encoding === "ogg") return "ogg_opus";
  if (encoding === "raw" || encoding === "wav") return "pcm";
  return encoding;
}

function redact(value) {
  if (!value) return value;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function getDefaultConfigPath() {
  if (process.env.VOLC_TTS_CONFIG) return resolve(process.env.VOLC_TTS_CONFIG);

  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "volc-tts-cli", CONFIG_FILE_NAME);
  }

  const home = process.env.HOME ?? process.cwd();
  const base = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  return join(base, "volc-tts-cli", CONFIG_FILE_NAME);
}

function getConfigPath(options = {}) {
  return resolve(options.config ?? getDefaultConfigPath());
}

async function loadAuthConfig(path) {
  try {
    const content = await readFile(path, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Failed to read auth config ${path}: ${error.message}`);
  }
}

async function saveAuthConfig(path, config) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700).catch(() => {});
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
}

async function removeAuthConfig(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function promptText(question, defaultValue) {
  if (!process.stdin.isTTY) {
    throw new Error(`Missing ${question}. Pass it as an option when running non-interactively.`);
  }

  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${question}${suffix}: `);
    return answer.trim() || defaultValue || "";
  } finally {
    rl.close();
  }
}

async function promptSecret(question, defaultValue) {
  if (!process.stdin.isTTY) {
    throw new Error(`Missing ${question}. Pass it as an option when running non-interactively.`);
  }

  return new Promise((resolveSecret, rejectSecret) => {
    const input = process.stdin;
    const output = process.stderr;
    const wasRaw = input.isRaw;
    let value = "";

    const cleanup = () => {
      input.off("data", onData);
      if (input.isTTY) input.setRawMode(wasRaw);
      input.pause();
    };

    const finish = () => {
      output.write("\n");
      cleanup();
      resolveSecret(value || defaultValue || "");
    };

    const onData = (chunk) => {
      const chars = chunk.toString("utf8");
      for (const char of chars) {
        if (char === "\u0003") {
          output.write("\n");
          cleanup();
          rejectSecret(new Error("Interrupted"));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          return;
        }
        if (char === "\u007f") {
          if (value.length > 0) value = value.slice(0, -1);
          continue;
        }
        value += char;
        output.write("*");
      }
    };

    output.write(`${question}${defaultValue ? ` [${redact(defaultValue)}]` : ""}: `);
    input.setEncoding("utf8");
    if (input.isTTY) input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function handleAuth(argv) {
  const action = argv[0] ?? "status";

  if (action === "-h" || action === "--help") {
    printAuthHelp();
    return;
  }

  const options = parseArgs(argv.slice(1));
  if (options.help) {
    printAuthHelp();
    return;
  }

  await loadEnvFile(options.envFile ?? ".env");
  const configPath = getConfigPath(options);

  if (action === "login") {
    const existing = await loadAuthConfig(configPath);
    const apiKey =
      options.apiKey ??
      process.env.VOLC_TTS_API_KEY ??
      existing.apiKey ??
      (await promptSecret("API key (leave empty for legacy App ID/Token)", ""));
    const appId = apiKey
      ? undefined
      : options.appId ??
        process.env.VOLC_TTS_APP_ID ??
        (await promptText("App ID", existing.appId));
    const token = apiKey
      ? undefined
      : options.token ??
        process.env.VOLC_TTS_TOKEN ??
        (await promptSecret("Access token", existing.token));
    const voice =
      options.voice ??
      process.env.VOLC_TTS_VOICE_TYPE ??
      (await promptText("Voice type", existing.voice ?? DEFAULT_V3_VOICE));

    const nextConfig = {
      apiKey,
      appId,
      token,
      voice,
      cluster: configuredValue(options.cluster, "VOLC_TTS_CLUSTER", existing.cluster, "volcano_tts"),
      endpoint: configuredValue(
        options.endpoint,
        "VOLC_TTS_ENDPOINT",
        existing.endpoint,
        apiKey ? DEFAULT_V3_ENDPOINT : DEFAULT_ENDPOINT,
      ),
      resourceId: configuredValue(
        options.resourceId,
        "VOLC_TTS_RESOURCE_ID",
        existing.resourceId,
        apiKey ? DEFAULT_V3_RESOURCE_ID : undefined,
      ),
      uid: configuredValue(options.uid, "VOLC_TTS_UID", existing.uid, "volc-tts-cli"),
      encoding: configuredValue(options.encoding, "VOLC_TTS_ENCODING", existing.encoding, "mp3"),
      updatedAt: new Date().toISOString(),
    };

    validateStoredAuth(nextConfig);
    await saveAuthConfig(configPath, nextConfig);
    console.error(`Saved auth config to ${configPath}`);
    return;
  }

  if (action === "status") {
    const config = await loadAuthConfig(configPath);
    printAuthStatus(configPath, config);
    return;
  }

  if (action === "logout") {
    await removeAuthConfig(configPath);
    console.error(`Removed auth config from ${configPath}`);
    return;
  }

  throw new Error(`Unknown auth command: ${action}`);
}

function printAuthHelp() {
  console.log(`volc-tts auth - manage persisted credentials

Usage:
  volc-tts auth login
  volc-tts auth login --app-id appid --token token --voice voice_type
  volc-tts auth status
  volc-tts auth logout

Options:
  --api-key <key>         Volcengine / Doubao speech API key
  --app-id <appid>        Volcengine TTS app ID
  --token <token>         Volcengine TTS access token
  --voice <voice_type>    Voice type / voice ID
  --cluster <cluster>     TTS cluster
  --endpoint <url>        TTS endpoint
  --resource-id <id>      Optional API resource ID header
  --uid <uid>             User ID in request payload
  --encoding <format>     Default audio encoding
  --config <file>         Auth config path
  --env-file <file>       Load env file before auth login
`);
}

function validateStoredAuth(config) {
  const missing = [];
  if (!config.apiKey && !config.appId) missing.push("API key or app ID");
  if (!config.apiKey && !config.token) missing.push("access token");
  if (!config.voice) missing.push("voice type");
  if (missing.length > 0) {
    throw new Error(`Missing required auth value: ${missing.join(", ")}`);
  }
}

function printAuthStatus(configPath, config) {
  const hasConfig = Object.keys(config).length > 0;
  console.log(`Config: ${configPath}`);
  console.log(`Status: ${hasConfig ? "logged in" : "not logged in"}`);
  if (!hasConfig) return;
  if (config.apiKey) console.log(`API Key: ${redact(config.apiKey)}`);
  if (config.appId) console.log(`App ID: ${config.appId}`);
  if (config.token) console.log(`Token: ${redact(config.token)}`);
  console.log(`Voice: ${config.voice ?? ""}`);
  console.log(`Cluster: ${config.cluster ?? ""}`);
  console.log(`Endpoint: ${config.endpoint ?? ""}`);
  if (config.resourceId) console.log(`Resource ID: ${config.resourceId}`);
  if (config.encoding) console.log(`Encoding: ${config.encoding}`);
  if (config.updatedAt) console.log(`Updated: ${config.updatedAt}`);
}

function redactRequest(headers, payload) {
  return {
    headers: {
      ...headers,
      Authorization: headers.Authorization ? "Bearer;****" : undefined,
      "X-Api-Key": headers["X-Api-Key"] ? "****" : undefined,
    },
    payload: payload.app
      ? {
          ...payload,
          app: {
            ...payload.app,
            token: redact(payload.app.token),
          },
        }
      : payload,
  };
}

function validateConfig(config, options) {
  const missing = [];
  if (!config.apiKey && !config.appId) missing.push("VOLC_TTS_API_KEY/--api-key or VOLC_TTS_APP_ID/--app-id");
  if (!config.apiKey && !config.token) missing.push("VOLC_TTS_TOKEN or --token");
  if (!config.voice) missing.push("VOLC_TTS_VOICE_TYPE or --voice");
  if (config.authMode === "api-key" && !config.resourceId) {
    missing.push("VOLC_TTS_RESOURCE_ID or --resource-id");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }

  assertFiniteNumber("--speed", options.speed);
  assertFiniteNumber("--volume", options.volume);
  assertFiniteNumber("--pitch", options.pitch);
  assertFiniteNumber("--rate", options.rate);
  assertFiniteNumber("--speech-rate", options.speechRate);
  assertFiniteNumber("--loudness-rate", options.loudnessRate);
  assertFiniteNumber("--pitch-rate", options.pitchRate);
  assertFiniteNumber("--emotion-scale", options.emotionScale);
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

async function parseTtsResponse(response, config) {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = Buffer.from(await response.arrayBuffer());
  const text = raw.toString("utf8");

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  if (config.authMode === "api-key") {
    return parseApiKeyResponse(text, raw);
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

function parseApiKeyResponse(text, raw) {
  const trimmed = text.trim();
  if (!trimmed) return raw;

  const chunks = splitConcatenatedJson(trimmed);
  if (chunks.length === 0) return raw;

  const audioParts = [];
  let lastError = null;

  for (const chunk of chunks) {
    const item = JSON.parse(chunk);
    const code = item.code ?? item.status_code;
    if (code !== undefined && !isSuccessCode(code)) {
      lastError = item.message ?? item.error ?? JSON.stringify(item);
      continue;
    }
    if (typeof item.data === "string" && item.data.length > 0) {
      audioParts.push(Buffer.from(item.data, "base64"));
    }
  }

  if (audioParts.length === 0) {
    throw new Error(`TTS response has no audio data${lastError ? `: ${lastError}` : `: ${trimmed.slice(0, 500)}`}`);
  }

  return Buffer.concat(audioParts);
}

function isSuccessCode(code) {
  return code === 0 || code === 20000000 || code === "0" || code === "20000000";
}

function splitConcatenatedJson(text) {
  const chunks = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        chunks.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return chunks;
}

function looksLikeJson(text) {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === "auth") {
    await handleAuth(argv.slice(1));
    return;
  }

  const options = parseArgs(argv);

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
  const authConfig = await loadAuthConfig(getConfigPath(options));

  const text = await getText(options);
  const apiKey = configuredValue(options.apiKey, "VOLC_TTS_API_KEY", authConfig.apiKey);
  const authMode = apiKey ? "api-key" : "legacy";
  const config = {
    authMode,
    apiKey,
    appId: configuredValue(options.appId, "VOLC_TTS_APP_ID", authConfig.appId),
    token: configuredValue(options.token, "VOLC_TTS_TOKEN", authConfig.token),
    voice: configuredValue(options.voice, "VOLC_TTS_VOICE_TYPE", authConfig.voice, apiKey ? DEFAULT_V3_VOICE : undefined),
    cluster: configuredValue(options.cluster, "VOLC_TTS_CLUSTER", authConfig.cluster, "volcano_tts"),
    endpoint: configuredValue(
      options.endpoint,
      "VOLC_TTS_ENDPOINT",
      authConfig.endpoint,
      apiKey ? DEFAULT_V3_ENDPOINT : DEFAULT_ENDPOINT,
    ),
    resourceId: configuredValue(
      options.resourceId,
      "VOLC_TTS_RESOURCE_ID",
      authConfig.resourceId,
      apiKey ? DEFAULT_V3_RESOURCE_ID : undefined,
    ),
    uid: configuredValue(options.uid, "VOLC_TTS_UID", authConfig.uid, "volc-tts-cli"),
    encoding: configuredValue(options.encoding, "VOLC_TTS_ENCODING", authConfig.encoding, "mp3"),
    speed: options.speed ?? Number(process.env.VOLC_TTS_SPEED ?? authConfig.speed ?? 1),
    volume: options.volume ?? Number(process.env.VOLC_TTS_VOLUME ?? authConfig.volume ?? 1),
    pitch: options.pitch ?? Number(process.env.VOLC_TTS_PITCH ?? authConfig.pitch ?? 1),
    operation: configuredValue(options.operation, "VOLC_TTS_OPERATION", authConfig.operation, "query"),
  };
  options.resourceId = config.resourceId;

  validateConfig(config, options);

  const payload = buildPayload(text, config, options);
  const headers = buildHeaders(config, options);

  if (options.dryRun) {
    console.log(JSON.stringify(redactRequest(headers, payload), null, 2));
    return;
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const audio = await parseTtsResponse(response, config);
  await writeAudio(audio, options, config.encoding);
}

main().catch((error) => {
  console.error(`volc-tts: ${error.message}`);
  process.exitCode = 1;
});
