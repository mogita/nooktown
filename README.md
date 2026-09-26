# Nooktown

A calm lofi vibe mixer: a pixel art rooftop with a cat, live synthesized music, rain, wind, birds, chimes, crickets and vinyl crackle. No dependencies and no build step.

## Run

```sh
python3 serve.py
```

Open http://localhost:5173. `python3 serve.py <host> <port>` serves on another address, for example your LAN IP to test on a phone. The audio check lives at http://localhost:5173/tests/audio.html and prints PASS or FAIL.

## Deploy

```sh
wrangler deploy
```

Publishes the app files to https://nooktown.mogita.rocks as a static-assets Worker. `.assetsignore` keeps the art sources, tests and dev files out.

## Layout

- `src/audio.js`: Web Audio engine (FM electric piano, bass, drums, ambience, tape wow).
- `src/scene.js`: WebGL2 renderer (dithered scene transitions, rain, glow, fireflies, cloud shadows, cat sprite).
- `src/main.js`: state, controls, persistence.
- `art/`: Codex prompts and raw images. `sh art/variants.sh` regenerates missing variants, `python3 art/snap.py` snaps them into `assets/`.
