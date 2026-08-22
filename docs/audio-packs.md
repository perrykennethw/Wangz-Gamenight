# Configuring an audio pack

Wangz Gamenight ships only its original synthesized sound pack. A deployment can offer a recorded pack by setting the build-time `VITE_GAME_AUDIO_PACK_URL` variable to an HTTPS JSON manifest. This variable is a public frontend URL, not a credential.

Do not use recordings copied from television broadcasts, YouTube, social media, or an unverified download. Before configuring a pack, retain written evidence that the named rights owner permits the application to host, reproduce, and play every recording in the intended deployment. Noncommercial use by itself is not permission.

## Manifest format

The manifest and recordings can live in Cloudflare R2 or another static host:

```json
{
  "version": 1,
  "id": "stakeholder-approved-feud-audio",
  "name": "Stakeholder-approved audio",
  "rights": {
    "source": "Describe where the supplied files came from",
    "owner": "Name the recording rights owner",
    "license": "Identify the license or dated written permission",
    "distribution": "Describe where and how Wangz Gamenight may use the files",
    "attribution": "Optional required attribution"
  },
  "cues": {
    "opening": "./opening.mp3",
    "faceoff-buzz": "./faceoff-buzz.mp3",
    "answer-reveal": "./answer-reveal.mp3",
    "wrong-answer": "./wrong-answer.mp3",
    "repeat-answer": "./repeat-answer.mp3",
    "timer-warning": "./timer-warning.mp3",
    "timer-expired": "./timer-expired.mp3",
    "round-win": "./round-win.mp3",
    "game-win": "./game-win.mp3",
    "fast-money-start": "./fast-money-start.mp3",
    "fast-money-reveal": "./fast-money-reveal.mp3",
    "fast-money-win": "./fast-money-win.mp3"
  }
}
```

Relative recording paths resolve from the manifest URL. A pack may omit cues; the app uses the original synthesized cue for each omission. Unknown cue IDs and manifests without complete rights metadata are rejected.

## Hosting and deployment

1. Upload the approved manifest and recordings to a public HTTPS location. Use compressed browser-supported files such as MP3, AAC/M4A, OGG, or WAV, and keep cues short enough for their game moment.
2. Configure the asset host to allow `GET` and `HEAD`. The manifest response must allow cross-origin reads from the deployed Wangz Gamenight origin; for R2, add that origin to the bucket CORS policy. Test both the manifest and every recording from the production site.
3. Add `VITE_GAME_AUDIO_PACK_URL` as a GitHub Actions repository variable in the `production` environment, using the full manifest URL. An identically named Actions secret also works, but the URL is public and normally belongs in a variable.
4. Deploy the application. Enable audio from a user gesture, choose the recorded pack in the host audio panel, and preview the primary cues before starting a game.

The manifest is validated and recordings are preloaded in the host browser. A failed fetch, missing cue, unsupported recording, or rejected playback leaves gameplay intact and uses the original procedural cue when the browser can play it.
