import * as pw from "@playwright/test";
const { devices } = pw;

const test = process.env.RUN_TEST ?? "dev";

const commands: Record<string, string> = {
	dev: "pnpm dev",
	prod: "pnpm build && pnpm start",
	miniflare: "miniflare -m dist/server/cloudflare-workers-bundle.js -p 3000",
	netlify: "pnpm build:netlify && netlify dev -d netlify/static -op 3000",
	"netlify-edge":
		"pnpm build:netlify-edge && netlify dev -d netlify/static -op 3000",
	deno: "pnpm build:deno && deno run --allow-read --allow-net --allow-env dist/deno/mod.js",
};

const command = commands[test] ?? commands.dev;

const config: pw.PlaywrightTestConfig = {
	testDir: "./tests",
	webServer: {
		command,
		port: 3000,
	},
	timeout: 30 * 1000,
	expect: {
		timeout: 5000,
	},
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 2,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		actionTimeout: 0,
		trace: "on-first-retry",
	},

	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
			},
		},
	],
};

export default config;
