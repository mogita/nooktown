#!/bin/sh
# Regenerates weather and time variants of each place as edits of its rainy day scene via Codex built-in image_gen.
cd "$(dirname "$0")/.."
# Usage: edit <base scene> <what must stay empty>, then name|description lines on stdin.
edit() {
  while IFS='|' read -r name desc; do
    [ -f "art/raw/$name.png" ] && continue
    {
      printf '%s' "Use your built-in image_gen tool (not the CLI script) to EDIT the attached image (the edit target), then copy the final PNG to art/raw/$name.png in this workspace. Do not write any code or other files.

Use case: lighting-weather
Change only: $desc
Keep unchanged: the exact composition, framing, camera, every object and its position and outline, the same chunky pixel art style and pixel grid size, $2.
Constraints: a fully opaque image, crisp hard-edged pixel art with a limited palette, no anti-aliasing, no blur. Absolutely no falling rain streaks, raindrops or snow in the air. No people, animals, cats, birds, text, logo or watermark." | codex exec --skip-git-repo-check -c model_reasoning_effort='"low"' -C "$PWD" -i "art/raw/$1.png" > "art/codex-$name.log" 2>&1
      echo "$name: $([ -f "art/raw/$name.png" ] && echo ok || echo FAILED)"
    } &
  done
  wait
}
edit rain-day 'the empty flat stone surface in the horizontal center of the ledge top' <<'LIST'
cloud-day|a dry overcast day: soft bright grey-white cloud cover, gentle diffuse daylight, dry stone with no puddles or wet sheen, city windows unlit, string light bulbs unlit.
sun-day|a clear sunny late morning: bright soft blue sky with a few small white clouds, warm sunlight from the upper left with crisp soft shadows, dry stone with no puddles, vivid but gentle greens, city windows unlit, string light bulbs unlit.
rain-evening|a rainy dusk: deep blue-violet overcast sky with a faint warm glow near the horizon, wet stone with puddles reflecting warm light, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit.
cloud-evening|an overcast dusk: lavender and peach tinted clouds, dry stone with no puddles, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit.
sun-evening|a clear golden hour sunset: sky blending orange, pink and lavender, the sun low behind the far hills, long warm golden light on everything, dry stone with no puddles, every string light bulb glowing softly, some city windows lit.
rain-night|a rainy night: dark navy overcast sky, wet stone and puddles reflecting the warm string lights, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit, everything else in cool deep blue shadow.
cloud-night|a cloudy night: overcast sky faintly lit from below by the city glow, dry stone with no puddles, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit, cool blue shadows.
sun-night|a clear starry night: deep indigo sky with many small scattered stars and a thin crescent moon, cool moonlight, dry stone with no puddles, every string light bulb glowing warm amber, many city windows lit amber, the small lantern lit.
LIST
edit room-rain-day 'the empty flat surface in the horizontal center of the window sill' <<'LIST'
room-cloud-day|a dry overcast day: soft bright grey-white cloud cover through the leaves, gentle diffuse daylight in the room, dry glass with no water beads, the table lamp switched off, the fairy lights unlit, the town windows outside unlit.
room-sun-day|a clear sunny late morning: bright soft blue sky with a few small white clouds through the leaves, warm sunlight streaming in from the upper left and casting a soft patch of light with dappled leaf shadows on the sill and the wall, vivid but gentle greens outside, dry glass with no water beads, the table lamp switched off, the fairy lights unlit.
room-rain-evening|a rainy dusk: deep blue-violet overcast sky through the leaves, the tree darker, the room dim and cool except the table lamp glowing warm amber and the fairy lights glowing warm amber, a few town windows outside lit amber, water beads on the glass catching the warm light.
room-cloud-evening|an overcast dusk: lavender and peach tinted clouds through the leaves, dry glass with no water beads, the table lamp glowing warm amber, the fairy lights glowing warm amber, a few town windows outside lit amber, the room in soft dim light.
room-sun-evening|a clear golden hour sunset: sky blending orange, pink and lavender through the leaves, long warm golden light streaming in low across the sill and the wall, the tree backlit with glowing edges, dry glass with no water beads, the table lamp softly lit, the fairy lights glowing softly.
room-rain-night|a rainy night: dark navy sky, the tree a deep dark silhouette, a few town windows outside lit amber, water beads on the glass catching the lamp light, the table lamp and the fairy lights glowing warm amber and casting a cozy pool of warm light on the sill, the rest of the room in cool deep blue shadow.
room-cloud-night|a cloudy night: overcast sky faintly lit from below by the city glow, the tree a dark silhouette, dry glass with no water beads, a few town windows outside lit amber, the table lamp and the fairy lights glowing warm amber, the rest of the room in cool blue shadow.
room-sun-night|a clear starry night: deep indigo sky with a few small scattered stars between the leaves, cool moonlight, the tree a dark silhouette with moonlit edges, dry glass with no water beads, a few town windows outside lit amber, the table lamp and the fairy lights glowing warm amber, the rest of the room in cool blue shadow.
LIST
