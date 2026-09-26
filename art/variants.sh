#!/bin/sh
# Regenerates weather and time variants as edits of art/raw/rain-day.png via Codex built-in image_gen.
cd "$(dirname "$0")/.."
while IFS='|' read -r name desc; do
  [ -f "art/raw/$name.png" ] && continue
  printf '%s' "Use your built-in image_gen tool (not the CLI script) to EDIT the attached image (the edit target), then copy the final PNG to art/raw/$name.png in this workspace. Do not write any code or other files.

Use case: lighting-weather
Change only: $desc
Keep unchanged: the exact composition, framing, camera, every object and its position and outline, the same chunky pixel art style and pixel grid size, the empty flat stone surface in the horizontal center of the ledge top.
Constraints: crisp hard-edged pixel art with a limited palette, no anti-aliasing, no blur. Absolutely no falling rain streaks, raindrops or snow in the air. No people, animals, cats, birds, text, logo or watermark." | codex exec --skip-git-repo-check -c model_reasoning_effort='"low"' -C "$PWD" -i art/raw/rain-day.png > "art/codex-$name.log" 2>&1
  echo "$name: $([ -f "art/raw/$name.png" ] && echo ok || echo FAILED)"
done <<'LIST'
cloud-day|a dry overcast day: soft bright grey-white cloud cover, gentle diffuse daylight, dry stone with no puddles or wet sheen, city windows unlit, string light bulbs unlit.
sun-day|a clear sunny late morning: bright soft blue sky with a few small white clouds, warm sunlight from the upper left with crisp soft shadows, dry stone with no puddles, vivid but gentle greens, city windows unlit, string light bulbs unlit.
rain-evening|a rainy dusk: deep blue-violet overcast sky with a faint warm glow near the horizon, wet stone with puddles reflecting warm light, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit.
cloud-evening|an overcast dusk: lavender and peach tinted clouds, dry stone with no puddles, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit.
sun-evening|a clear golden hour sunset: sky blending orange, pink and lavender, the sun low behind the far hills, long warm golden light on everything, dry stone with no puddles, every string light bulb glowing softly, some city windows lit.
rain-night|a rainy night: dark navy overcast sky, wet stone and puddles reflecting the warm string lights, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit, everything else in cool deep blue shadow.
cloud-night|a cloudy night: overcast sky faintly lit from below by the city glow, dry stone with no puddles, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit, cool blue shadows.
sun-night|a clear starry night: deep indigo sky with many small scattered stars and a thin crescent moon, cool moonlight, dry stone with no puddles, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit.
LIST
