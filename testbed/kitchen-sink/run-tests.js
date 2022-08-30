// @ts-check
import cp from "node:child_process";

let tests = process.env.INCLUDE_TESTS ?? "all";
if (tests === "all") {
	tests = "dev,prod,miniflare,netlify,netlify-edge,deno";
}

let failed = false;

for (const test of tests.split(",")) {
	console.log(`Running tests for ${test}`);
	const child = cp.spawn("playwright test", {
		shell: true,
		env: {
			...process.env,
			RUN_TEST: test,
		},
		stdio: "inherit",
	});

	await new Promise((resolve) => {
		child.on("exit", (code) => {
			if (code !== 0) {
				console.error(`Tests for ${test} failed`);
				failed = true;
			}

			resolve(undefined);
		});
	});
}

process.exit(failed ? 1 : 0);
