# Pet sprites

Production-ready sprite set for the Telegram Mini App habit pet.

- `manifest.json` is the source of truth for paths, frame counts, FPS and loop behavior.
- Every PNG is a horizontal strip of 128×128 RGBA frames.
- The lowest opaque pixel of pet/death frames is aligned to `y = 120`.
- All visible pixels use the same 16-color palette from the approved reference.
- `preview.html` works directly from disk through `manifest.js`, which is generated from the same manifest data.

Rebuild and validate:

```powershell
python scripts/build_pet_sprites.py
```

Basic canvas playback:

```js
const frame = Math.floor(time * animation.fps / 1000) % animation.frames;
ctx.drawImage(image, frame * 128, 0, 128, 128, x, y, 128, 128);
```

For one-shot animations, clamp to the final frame instead of applying modulo.
