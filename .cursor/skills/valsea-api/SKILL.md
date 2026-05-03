---
name: valsea-api
description: >-
  Integrates the Valsea speech intelligence REST and WebSocket APIs (transcription,
  translation, annotation, clarification, conversion, formatting, sentiment, realtime).
  Use when the user mentions Valsea, VALSEA, api.valsea.ai, speech-to-text for Southeast
  Asia, valsea-transcribe, or when implementing or debugging code against llm.txt or
  Valsea documentation.
---

# Valsea API

Canonical local reference: [llm.txt](../../../llm.txt) at the repository root (full language lists, links).

## Auth and base URL

- Base URL: `https://api.valsea.ai`
- Headers: `Authorization: Bearer YOUR_API_KEY` **or** `X-API-Key: YOUR_API_KEY`
- Keys start with `vl_`; dashboard: https://valsea.ai/en/dashboard/api-keys
- All POST endpoints support `response_format`: `json` (default) or `verbose_json`

## REST endpoints

| Method | Path | Content-Type | Model constant |
|--------|------|----------------|----------------|
| POST | `/v1/audio/transcriptions` | multipart/form-data | `valsea-transcribe` |
| POST | `/v1/translations` | application/json | `valsea-translate` |
| POST | `/v1/annotations` | application/json | `valsea-annotate` |
| POST | `/v1/clarifications` | application/json | `valsea-clarify` |
| POST | `/v1/conversions` | application/json | `valsea-convert` |
| POST | `/v1/formatting` | application/json | `valsea-format` |
| POST | `/v1/sentiment` | application/json | `valsea-sentiment` |

Full URLs: `https://api.valsea.ai` + path (e.g. `https://api.valsea.ai/v1/audio/transcriptions`).

## Transcription (OpenAI-compatible)

Point the official OpenAI SDK at Valsea:

- **baseURL**: `https://api.valsea.ai/v1`
- **Required**: `model: 'valsea-transcribe'`, `language: '<code>'` (see `llm.txt` for allowed codes)
- **Multipart**: `file` (WAV, MP3, M4A, FLAC, OGG, WEBM; max 10 MB, 1 hour)
- Optional: `enable_correction`, `enable_tags`, `response_format`

TypeScript: `client.audio.transcriptions.create({ file, model: 'valsea-transcribe', language: 'english' })`

Python: `extra_body={"enable_correction": True}` (and similar) when the SDK needs vendor fields.

## JSON APIs — required fields (minimal)

- **Translate**: `model`, `text`, `target`; optional `source` (default `"auto"`)
- **Annotate**: `model`, `text`; optional `language`, `enable_correction`, `enable_tags`
- **Clarify**: `model`, `text`; optional `language`
- **Convert**: `model`, `annotated_text`; optional `semantic_tags` (`{ tag, phrase, meaning }[]`)
- **Format**: `model`, `transcript`, `output_type` — one of: `meeting_minutes`, `sales_summary`, `service_log`, `subtitles`, `email_summary`, `action_items`, `key_quotes`, `interview_notes`; optional `semantic_tags`, `stream`
- **Sentiment**: `model`, `transcript`; optional `semantic_tags`

## Live transcription (WebSocket)

- URL: `wss://api.valsea.ai/v1/realtime`
- Same auth headers as REST
- Audio: raw PCM 16-bit, 16 kHz, mono, base64 in `audio.append`
- Client: `session.start` (e.g. `model: "valsea-rtt"`), `audio.append`, `audio.commit`, `session.stop`
- Treat `transcript.partial` as ephemeral UI; persist only `transcript.final` segments

## Errors

- `401`: bad/missing key
- `402`: insufficient credits
- `413`: transcription file too large/long

## When coding

1. Never commit API keys; use env vars (e.g. `VALSEA_API_KEY`).
2. Prefer `verbose_json` when the user needs metadata (languages, corrections, tags).
3. For the complete transcription language enum and doc links, read `llm.txt` or https://valsea.ai/docs
