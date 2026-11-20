/**
 * Generates the extension icons and store assets from one square master image.
 *
 *   bun run icons                             # brand/icon.png by default
 *   bun run icons --source=brand/logo.png     # paths are repo-root relative
 *   bun run icons --source=... --out=/tmp/x   # preview without touching assets
 *
 * Outputs:
 *   public/icon/{16,32,48,128}.png   referenced by the manifest
 *   ../../docs/assets/icon-{256,512}.png   store listing / README use
 *
 * Use a square source of at least 512x512. `--trim` removes a uniform border,
 * keeps the artwork's aspect ratio, and centres it on a transparent square with
 * a small margin. That is usually what you want for a mascot on a flat canvas.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const args = process.argv.slice(2);

function flag(name, fallback) {
	const match = args.find((arg) => arg.startsWith(`--${name}=`));
	return match === undefined ? fallback : match.slice(name.length + 3);
}

const source = resolve(repoRoot, flag("source", "brand/icon.png"));
const outDir = resolve(repoRoot, flag("out", "apps/extension/public/icon"));
const storeDir = resolve(repoRoot, flag("store-out", "docs/assets"));
const trim = args.includes("--trim");

if (!existsSync(source)) {
	console.error(`[icons] source not found: ${source}`);
	console.error("[icons] pass --source=path/to/square-master.png");
	process.exit(1);
}

const manifestSizes = [16, 32, 48, 128];
const storeSizes = [256, 512];

await mkdir(outDir, { recursive: true });
await mkdir(storeDir, { recursive: true });

const metadata = await sharp(source).metadata();
if (metadata.width === undefined || metadata.height === undefined) {
	console.error("[icons] could not read source dimensions");
	process.exit(1);
}
if (Math.abs(metadata.width - metadata.height) > 2) {
	console.warn(
		`[icons] source is ${metadata.width}x${metadata.height}; non-square images are centre-cropped`,
	);
}
if (Math.min(metadata.width, metadata.height) < 512) {
	console.warn("[icons] source is smaller than 512px; large sizes will be upscaled");
}

async function render(size, destination) {
	if (trim) {
		const inner = Math.max(1, Math.round(size * 0.92));
		const face = await sharp(source)
			.trim()
			.resize(inner, inner, {
				fit: "contain",
				background: { r: 0, g: 0, b: 0, alpha: 0 },
				kernel: "lanczos3",
			})
			.png()
			.toBuffer();
		await sharp({
			create: {
				width: size,
				height: size,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.composite([{ input: face, gravity: "centre" }])
			.png({ compressionLevel: 9 })
			.toFile(destination);
	} else {
		await sharp(source)
			.resize(size, size, { fit: "cover", position: "centre", kernel: "lanczos3" })
			.png({ compressionLevel: 9 })
			.toFile(destination);
	}
	console.log(`[icons] ${size}x${size} -> ${destination}`);
}

for (const size of manifestSizes) {
	await render(size, join(outDir, `${size}.png`));
}
for (const size of storeSizes) {
	await render(size, join(storeDir, `icon-${size}.png`));
}

console.log("[icons] done");
