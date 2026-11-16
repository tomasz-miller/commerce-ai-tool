---
"@commerce-ai-tool/server": patch
"@commerce-ai-tool/core": patch
---

Size and media-type limits on request bodies. JSON bodies are capped at 64 KB, `/search/image` files at 8 MiB (JPEG, PNG or WebP only) and `/search/voice` files at 10 MiB (the audio types core supports: wav, webm, mp3, mp4/m4a, ogg, flac, aac). Over-size requests return 413 `PAYLOAD_TOO_LARGE` and other types 415 `UNSUPPORTED_MEDIA_TYPE`, before the body is buffered, in both the Express and Next.js adapters (busboy `limits` on Express; `Content-Length` plus a streaming byte count on Next.js, so chunked uploads are capped too). A multipart request may carry one file and 20 text fields; a second file is 400 `VALIDATION` instead of being concatenated into the first. Voice uploads of an unlisted audio type are now rejected with 415 even with ElevenLabs STT, which previously accepted any type. `/search/voice` with no speech-to-text backend configured now returns 503 `UPSTREAM_UNAVAILABLE` instead of 500, as documented. Core exports `UnsupportedAudioTypeError` (thrown by `mimeTypeToAudioFormat`) and `VoiceNotConfiguredError`; `SUPPORTED_AUDIO_MIME_TYPES` is in `@commerce-ai-tool/core/internal`.
