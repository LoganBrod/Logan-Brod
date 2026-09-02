# Calibration images

The swipe deck runs on a static, attribute-tagged image set rather than live
listings. Every variant differs from its base in exactly one axis, so a yes or
no on a variant is a clean signal about that axis. `public/calibration/manifest.json`
is the source of truth for tags; the files sit beside it.

## Generating the proof set (chore jacket, 8 images)

Run from a machine where `api.higgsfield.ai` is reachable (this repo's remote
environment blocks it by egress policy). One garment, base first, then each
variant referencing the base so framing and light stay identical:

```bash
# base
higgsfield product-photoshoot create --mode product_shot --count 1 --aspect_ratio 4:5 \
  --prompt "olive waxed cotton chore jacket, relaxed fit, ghost-mannequin front view, plain light-grey seamless ground, soft even studio light, no props, no people"

# then, with the base image downloaded as base.png, one call per variant -
# the only thing that changes is the phrase after "identical framing":
for v in "navy" "tan" "black"; do
  higgsfield product-photoshoot create --mode product_shot --count 1 --aspect_ratio 4:5 --image base.png \
    --prompt "the same chore jacket, identical framing, angle, lighting and ground; only change: colour is $v"
done
for m in "wool" "denim" "unwaxed cotton canvas"; do
  higgsfield product-photoshoot create --mode product_shot --count 1 --aspect_ratio 4:5 --image base.png \
    --prompt "the same olive chore jacket, identical framing, angle, lighting and ground; only change: material is $m"
done
higgsfield product-photoshoot create --mode product_shot --count 1 --aspect_ratio 4:5 --image base.png \
  --prompt "the same olive waxed cotton chore jacket, identical framing, angle, lighting and ground; only change: slim fit"
```

Save each result as WebP at 1200px on the long edge under the file name the
manifest gives it. `--count 1` per call on purpose: `--count N` asks the
backend to *vary* preset, lighting and angle across results, which is the
opposite of a controlled contrast.

## What to judge

- Does the base read as a real garment, not a render? Look at the seams, the
  collar, the fall of the fabric.
- Across the three colour variants, is *only* the colour different?
- Across the three material variants, does the texture read at card size?
- Would you react to the jacket, or to the picture?
