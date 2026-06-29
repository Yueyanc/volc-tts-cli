# volc-tts-cli

A small command-line tool for Volcengine / Doubao text-to-speech HTTP synthesis.

It is intentionally lightweight: no runtime dependencies, no credentials in the repo,
and a simple `volc-tts` command that reads credentials from persisted auth config,
environment variables, or a local `.env` file.

## Install

```bash
git clone https://github.com/Yueyanc/volc-tts-cli.git
cd volc-tts-cli
npm link
```

Or run directly:

```bash
node src/cli.js "你好，这是一次火山语音合成测试。" -o speech.mp3
```

## Configure

The easiest way is to persist a Doubao Speech API key with the CLI:

```bash
volc-tts auth login --api-key your_api_key
```

This uses the newer API-key mode:

```text
Endpoint: https://openspeech.bytedance.com/api/v3/tts/unidirectional
Header: X-Api-Key
Resource ID: seed-tts-2.0
Default voice: zh_female_xiaohe_uranus_bigtts
```

You can choose a voice explicitly:

```bash
volc-tts auth login \
  --api-key your_api_key \
  --voice zh_female_xiaohe_uranus_bigtts \
  --resource-id seed-tts-2.0
```

Credentials are stored at:

```text
~/.config/volc-tts-cli/config.json
```

The CLI writes this file with `600` permissions when the platform allows it.
Command-line flags override environment variables, and environment variables override
the persisted auth config.

Check auth status:

```bash
volc-tts auth status
```

Remove persisted credentials:

```bash
volc-tts auth logout
```

You can still use a local `.env` file instead:

```bash
cp .env.example .env
```

Fill in:

```bash
VOLC_TTS_API_KEY=your_api_key
VOLC_TTS_RESOURCE_ID=seed-tts-2.0
VOLC_TTS_VOICE_TYPE=your_voice_type
```

Legacy HTTP v1 credentials are still supported:

```bash
volc-tts auth login \
  --app-id your_app_id \
  --token your_access_token \
  --voice your_voice_type
```

Optional values:

```bash
VOLC_TTS_CLUSTER=volcano_tts
VOLC_TTS_ENCODING=mp3
VOLC_TTS_SPEED=1
VOLC_TTS_VOLUME=1
VOLC_TTS_PITCH=1
```

## Usage

```bash
volc-tts "今天这期主要看几个人工智能开发工具。" -o speech.mp3
```

Read from a file:

```bash
volc-tts --input script.txt --out speech.wav --encoding wav
```

Override voice and speed:

```bash
volc-tts "你好，欢迎回来。" --voice your_voice_type --speed 1.12 -o out.mp3
```

Inspect the request without sending secrets:

```bash
volc-tts "测试一下。" --dry-run
```

Write audio bytes to stdout:

```bash
volc-tts "测试一下。" --stdout > speech.mp3
```

## Options

```text
--text <text>              Text to synthesize
--input <file>             Read text from a UTF-8 file
--out <file>               Output audio path
--stdout                   Write audio bytes to stdout
--voice <voice_type>       Voice type / voice ID
--api-key <key>            Volcengine / Doubao speech API key
--app-id <appid>           Volcengine TTS app ID
--token <token>            Volcengine TTS access token
--cluster <cluster>        TTS cluster, default: volcano_tts
--endpoint <url>           TTS endpoint
--resource-id <id>         Optional API resource ID header for newer endpoints
--uid <uid>                User ID in request payload
--encoding <format>        mp3, wav, pcm, ogg_opus
--speed <number>           Speed ratio
--volume <number>          Volume ratio
--pitch <number>           Pitch ratio
--rate <number>            Sample rate
--language <lang>          Optional language code
--emotion <emotion>        Optional emotion/style field when supported
--audio-json <json>        Merge extra JSON into payload.audio
--request-json <json>      Merge extra JSON into payload.request
--app-json <json>          Merge extra JSON into payload.app
--header <name:value>      Add a custom HTTP header
--config <file>            Auth config path
--env-file <file>          Load env file, default: .env when present
--dry-run                  Print the request with secrets redacted
```

## Auth Commands

```bash
volc-tts auth login
volc-tts auth login --api-key api_key --voice voice_type
volc-tts auth login --app-id appid --token token --voice voice_type
volc-tts auth status
volc-tts auth logout
```

Use a custom config path when testing or when you want multiple profiles:

```bash
volc-tts auth login --config ./my-voice.json
volc-tts "测试一下。" --config ./my-voice.json -o speech.mp3
```

## Notes

- This CLI targets the common HTTP non-streaming TTS shape used by Volcengine / Doubao
  speech synthesis: app config, user, audio config, and a request object.
- Some newer products or private voice resources may require extra headers or payload
  fields. Use `--resource-id`, `--header`, `--audio-json`, `--request-json`, or
  `--app-json` to add those without changing the CLI.
- Keep `.env` private. It is ignored by git.

## References

- Volcengine CLI: https://github.com/volcengine/volcengine-cli
- Volcengine speech docs: https://www.volcengine.com/docs/6561/2277844
