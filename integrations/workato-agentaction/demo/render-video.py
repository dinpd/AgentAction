"""Render an edited 25-second demo from real Workato captures and verified results.

Requires Pillow, ffmpeg and ffprobe. Capture directory: trigger.png,
automatic-policy.png, automatic-outcome.png, replay.png, denied-outcome.png,
and proof.json (authenticated synthetic results and evidence; no tokens).
Optional macOS narration uses the installed Daniel voice. No network calls.
"""
import argparse
import json
import math
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT, FPS, SECONDS = 1920, 1080, 30, 25
STARTS = [0, 4, 9, 14, 19]
DURATIONS = [4, 5, 5, 5, 6]
NARRATION = [
    "Workato receives a forty-nine dollar refund request.",
    "AgentAction checks policy and authorizes it automatically.",
    "One refund executes, with signed evidence and a verified outcome.",
    "Repeat the job. The original refund returns, with no duplicate.",
    "A hundred-and-one dollar request is denied. Automate the work. Govern every action.",
]
SCENES = [
    ("01 / REQUEST", ["A refund request.", "Ready to run."], "$49", "USD · duplicate charge", "trigger.png"),
    ("02 / AUTHORIZE", ["Policy decides.", "Automatically."], "ALLOWED", "USD 49 ≤ USD 100 policy cap", "automatic-policy.png"),
    ("03 / EXECUTE + VERIFY", ["One refund.", "Verified outcome."], "1", "provider mutation · qualified success", "automatic-outcome.png"),
    ("04 / RETRY", ["Repeat the job.", "Same refund."], "STILL 1", "same business ID · no duplicate", "replay.png"),
    ("05 / ENFORCE", ["Over the limit?", "Denied."], "$101", "above USD 100 cap · 0 mutations", "denied-outcome.png"),
]


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def duration(path):
    return float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)))


def verify_proof(proof):
    automatic, denied, evidence = proof["automatic"], proof["denied"], proof["evidence"]
    replay = proof["replay"]
    assert automatic["amount_cents"] == 4900 and automatic["currency"] == "USD"
    assert automatic["reason"] == "duplicate_charge"
    assert automatic["authorization_mode"] == "automatic"
    assert automatic["policy_decision"] == "allowed"
    assert automatic["status"] == "succeeded" and automatic["mutation_count"] == 1
    assert automatic["qualified_success"] and not automatic["approval_id"]
    assert replay["replayed"] and replay["mutation_count"] == 1
    assert replay["request_id"] == automatic["request_id"]
    assert replay["refund_id"] == automatic["refund_id"]
    assert denied["status"] == "denied" and denied["amount_cents"] == 10100
    assert denied["policy_decision"] == "denied" and denied["mutation_count"] == 0
    assert not denied["refund_id"]
    assert evidence["observation"]["provenance"]["verification_method"] == "jws"
    assert any(e["type"] == "policy.allowed" for e in evidence["timeline"])
    assert not any(e["type"].startswith("approval.") for e in evidence["timeline"])
    jobs = {c["job_id"] for c in evidence["correlations"]}
    assert {proof["jobs"]["success"], proof["jobs"]["replay"]}.issubset(jobs)


def narration(output):
    clips = []
    for i, sentence in enumerate(NARRATION):
        clip = output.parent / f"narration-{i}.aiff"
        subprocess.run(["say", "-v", "Daniel", "-r", "185", "-o", str(clip), sentence], check=True)
        clips.append(clip)
    command = ["ffmpeg", "-y", "-loglevel", "error"]
    for clip in clips:
        command += ["-i", str(clip)]
    filters = []
    for i, (clip, seconds) in enumerate(zip(clips, DURATIONS)):
        speed = max(1, duration(clip) / (seconds - 0.55))
        filters.append(f"[{i}:a]atempo={speed:.5f},adelay=180:all=1,apad,atrim=duration={seconds},asetpts=PTS-STARTPTS[a{i}]")
    filters.append("".join(f"[a{i}]" for i in range(5)) + "concat=n=5:v=0:a=1,afade=t=out:st=24.6:d=0.4[a]")
    command += ["-filter_complex", ";".join(filters), "-map", "[a]", "-ar", "48000", "-ac", "2", str(output)]
    subprocess.run(command, check=True)


class Renderer:
    def __init__(self, captures, font_path, proof):
        self.fonts = {size: ImageFont.truetype(str(font_path), size) for size in [20, 23, 25, 28, 31, 34, 38, 44, 60, 64, 96]}
        self.proof = proof
        self.screens = {name: Image.open(captures / name).convert("RGB") for *_, name in SCENES}
        self.background = Image.new("RGB", (WIDTH, HEIGHT))
        pixels = self.background.load()
        for y in range(HEIGHT):
            for x in range(WIDTH):
                glow = math.exp(-((x - 1350) ** 2 / 900000 + (y - 160) ** 2 / 380000))
                pixels[x, y] = (int(12 + 9 * glow), int(20 + 17 * glow), int(32 + 24 * glow))
        self.static = [self.scene(i) for i in range(5)]

    def text(self, draw, at, value, size=28, color="#eef5fc"):
        draw.text(at, value, font=self.fonts[size], fill=color, stroke_width=0)

    def paste_fit(self, image, source, box):
        x, y, w, h = box
        scale = min(w / source.width, h / source.height)
        source = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
        image.paste(source, (x + (w - source.width) // 2, y + (h - source.height) // 2))

    def scene(self, i):
        image = self.background.copy()
        draw = ImageDraw.Draw(image)
        green, muted = "#71e5c0", "#9eb1c7"
        color = "#ffb397" if i == 4 else green
        self.text(draw, (100, 57), "Workato", 38)
        self.text(draw, (276, 62), "×", 28, muted)
        self.text(draw, (327, 57), "AgentAction", 38)
        draw.rounded_rectangle((1510, 52, 1820, 100), radius=24, fill="#233849", outline="#40566a")
        self.text(draw, (1562, 60), "SYNTHETIC DEMO", 23, green)
        tag, headline, metric, label, filename = SCENES[i]
        self.text(draw, (100, 203), tag, 25, color)
        for line, value in enumerate(headline):
            self.text(draw, (94, 270 + line * 78), value, 64)
        self.text(draw, (94, 453), metric, 96, color)
        self.text(draw, (100, 573), label, 28, muted)
        details = [
            ["Stable business request ID", "Payment + amount + reason"],
            ["No reviewer step", "Exact scope · single-use JIT"],
            ["Signed provider read-back", "Outcome: completed · constraints: pass"],
            ["Original refund ID returned", "Frozen evidence preserved"],
            ["Policy denied before execution", "No refund ID · zero mutations"],
        ][i]
        for j, value in enumerate(details):
            draw.ellipse((102, 662 + 57 * j, 112, 672 + 57 * j), fill=color)
            self.text(draw, (132, 649 + 57 * j), value, 28)
        draw.rounded_rectangle((910, 184, 1820, 907), radius=25, fill="#edf3f8")
        draw.rounded_rectangle((930, 203, 1800, 255), radius=10, fill="#ffffff")
        self.text(draw, (951, 213), "LIVE WORKATO RECIPE", 23, "#314c63")
        self.text(draw, (951, 278), "Automatic Support Refund — AgentAction", 28, "#16334a")
        screenshot = self.screens[filename]
        if i == 0:
            # Real trigger editor, including its title and complete five-field payload.
            self.paste_fit(image, screenshot.crop((11, 40, 620, 440)), (940, 341, 850, 550))
        else:
            # Retain the selected real action, output tab, and values without account UI.
            header = screenshot.crop((80, 551, 610, 610))
            self.paste_fit(image, header, (940, 343, 850, 110))
            crop = (80, 699, 610, 790) if i in [2, 3, 4] else (80, 698, 511, 832)
            self.paste_fit(image, screenshot.crop(crop), (944, 476, 842, 304))
            footnotes = ["", "authorization_mode: automatic", "qualified_success: true", "replayed: true · mutation_count: 1", "mutation_count: 0 · qualified_success: false"]
            self.text(draw, (953, 807), footnotes[i], 25, "#1d5548" if i != 4 else "#8b382d")
            self.text(draw, (953, 854), "Captured job output · synthetic provider", 23, "#577084")
        self.text(draw, (100, 984), "Actual Workato jobs · edited sequence · synthetic refunds", 23, muted)
        return image

    def frame(self, time):
        i = max(j for j, start in enumerate(STARTS) if start <= time)
        local = time - STARTS[i]
        image = self.static[i].copy()
        if i and local < 0.32:
            alpha = local / 0.32
            image = Image.blend(self.static[i - 1], image, alpha * alpha * (3 - 2 * alpha))
        draw = ImageDraw.Draw(image)
        # Sequential dots and a moving progress bar make the sequence visible without UI fabrication.
        for j in range(5):
            x = 680 + j * 33
            draw.ellipse((x, 76, x + 10, 86), fill="#71e5c0" if j <= i else "#3b5166")
        draw.rounded_rectangle((100, 1029, 1820, 1035), radius=3, fill="#2b4053")
        draw.rounded_rectangle((100, 1029, 100 + int(1720 * time / SECONDS), 1035), radius=3, fill="#71e5c0")
        if i == 4 and local >= 3:
            draw.rounded_rectangle((94, 791, 851, 900), radius=16, fill="#223849")
            self.text(draw, (117, 807), "Automate the work.", 31)
            self.text(draw, (117, 848), "Govern every action. Verify the outcome.", 28, "#71e5c0")
        return image


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--captures", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--font", type=Path, default=Path("/System/Library/Fonts/Helvetica.ttc"))
    parser.add_argument("--narration", action="store_true", help="Use local macOS Daniel voice")
    args = parser.parse_args()
    proof = json.loads((args.captures / "proof.json").read_text())
    verify_proof(proof)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for tool in ["ffmpeg", "ffprobe"] + (["say"] if args.narration else []):
        if not shutil.which(tool):
            parser.error(f"Required local tool is missing: {tool}")
    renderer = Renderer(args.captures, args.font, proof)
    audio = args.captures / "narration.wav"
    if args.narration:
        narration(audio)
    command = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-"]
    if args.narration:
        command += ["-i", str(audio), "-c:a", "aac", "-b:a", "192k"]
    command += ["-c:v", "libx264", "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p", "-t", str(SECONDS), "-movflags", "+faststart", str(args.output)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for frame in range(FPS * SECONDS):
            process.stdin.write(renderer.frame(frame / FPS).tobytes())
    finally:
        process.stdin.close()
    if process.wait():
        raise RuntimeError("Video encoder failed")
    metadata = json.loads(run("ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(args.output)))
    video = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"], video["r_frame_rate"]) == (WIDTH, HEIGHT, "30/1")
    assert video["codec_name"] == "h264" and int(video["nb_frames"]) == FPS * SECONDS
    assert abs(float(metadata["format"]["duration"]) - SECONDS) < 0.001
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(args.output), "-f", "null", "-"], check=True)
    sheet = Image.new("RGB", (960 * 3, 540 * 2), "#0c1420")
    for i, time in enumerate([2, 6.5, 11.5, 16.5, 21, 24]):
        frame = renderer.frame(time)
        frame.save(args.output.parent / f"preview-{i + 1}.png")
        sheet.paste(frame.resize((960, 540)), ((i % 3) * 960, (i // 3) * 540))
    sheet.save(args.output.parent / "contact-sheet.png")
    (args.output.parent / "video-validation.json").write_text(json.dumps({"duration_seconds": SECONDS, "width": WIDTH, "height": HEIGHT, "fps": FPS, "frames": FPS * SECONDS, "decoded": True, "narration": args.narration, "recipe_id": proof["recipe_id"], "jobs": proof["jobs"]}, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "duration_seconds": SECONDS, "frames": FPS * SECONDS, "decoded": True}))


if __name__ == "__main__":
    main()
