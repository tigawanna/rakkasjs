import * as pw from "@playwright/test";
import { load } from "cheerio";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { test, expect } = pw;

test("renders simple API route", async ({ request }) => {
	const response = await request.get("/api-routes/simple");
	expect(response.status()).toBe(200);
	const text = await response.text();
	expect(text).toEqual("Hello from API route");
});

test("runs middleware", async ({ request }) => {
	const response = await request.get("/api-routes/simple?abort=1");
	expect(response.status()).toBe(200);
	const text = await response.text();
	expect(text).toEqual("Hello from middleware");

	const response2 = await request.get("/api-routes/simple?modify=1");
	expect(response2.status()).toBe(200);
	const text2 = await response2.text();
	expect(text2).toEqual("Hello from API route");
	expect(response2.headers()["x-middleware"]).toEqual("1");
});

test("renders params in API route", async ({ request }) => {
	const response = await request.get("/api-routes/param-value");
	expect(response.status()).toBe(200);
	const json = await response.json();
	expect(json).toMatchObject({ param: "param-value" });
});

test("unescapes params in API route", async ({ request }) => {
	const response = await request.get("/api-routes/param%20value");
	expect(response.status()).toBe(200);
	const json = await response.json();
	expect(json).toMatchObject({ param: "param value" });
});

test("renders spread params in API route", async ({ request }) => {
	const response = await request.get("/api-routes/more/aaa/bbb/ccc");
	expect(response.status()).toBe(200);
	const json = await response.json();
	expect(json).toMatchObject({ rest: "/aaa/bbb/ccc" });
});

test("doesn't unescape spread params in API route", async ({ request }) => {
	const response = await request.get("/api-routes/more/aaa%2Fbbb/ccc");
	expect(response.status()).toBe(200);
	const json = await response.json();
	expect(json).toMatchObject({ rest: "/aaa%2Fbbb/ccc" });
});

test("renders preloaded data", async ({ request }) => {
	const response = await request.get("/");
	expect(response.status()).toBe(200);

	const html = await response.text();
	const dom = load(html);

	expect(dom("p#metadata").text()).toBe("Metadata: 2");
	expect(dom("title").text()).toBe("The page title");
});

test("decodes page params", async ({ request }) => {
	const response = await request.get("/page-params/unescape%20me");
	expect(response.status()).toBe(200);

	const html = await response.text();
	const dom = load(html);

	expect(dom("p#param").text()).toBe("unescape me");
});

test("doesn't unescape spread page params", async ({ request }) => {
	const response = await request.get("/page-params/spread/escape%2Fme");
	expect(response.status()).toBe(200);

	const html = await response.text();
	const dom = load(html);

	expect(dom("p#param").text()).toBe("/escape%2Fme");
});

test("renders interactive page", async ({ page }) => {
	await page.goto("/");
	await page.waitForSelector(".hydrated");

	const button = page.locator("button");
	await button.click();
	await expect(button).toHaveText("Clicked: 1");
});

if (process.env.RUN_TEST === "dev") {
	test("hot reloads page", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector(".hydrated");

		await new Promise((resolve) => setTimeout(resolve, 200));

		const button = await page.locator("button");
		await button.click();
		await expect(button).toHaveText("Clicked: 1");

		const filePath = path.resolve(__dirname, "../src/routes/index.page.tsx");

		const oldContent = await fs.promises.readFile(filePath, "utf8");
		const newContent = oldContent.replace("Hello world!", "Hot reloadin'!");

		await fs.promises.writeFile(filePath, newContent);

		const body = await page.locator("body");

		try {
			await expect(body).toHaveText(/Hot reloadin'!/);
			await expect(button).toHaveText("Clicked: 1");
		} finally {
			await fs.promises.writeFile(filePath, oldContent);
		}
	});

	test("newly created page appears", async ({ page }) => {
		await page.goto("/not-yet-created");

		await page.waitForSelector(".hydrated");

		const filePath = path.resolve(
			__dirname,
			"../src/routes/not-yet-created.page.tsx",
		);
		const content = `export default () => <h1>I'm a new page!</h1>`;
		await fs.promises.writeFile(filePath, content);

		const body = await page.locator("body");

		try {
			await expect(body).toHaveText(/I'm a new page!/);

			await fs.promises.rm(filePath);

			await expect(body).toHaveText(/Not Found/);
		} finally {
			await fs.promises.rm(filePath).catch(() => {
				// Ignore
			});
		}
	});
}

test("sets page title", async ({ page }) => {
	await page.goto("/title");
	await expect(page).toHaveTitle("Page title");
});

test("performs client-side navigation", async ({ page }) => {
	await page.goto("/nav");
	await page.waitForSelector(".hydrated");

	const button = page.locator("button");

	await button.click();
	await expect(button).toHaveText("State test: 1");

	const link = page.locator("a[href='/nav/a']");

	link.click();
	const body = page.locator("body");
	await expect(body).toHaveText(/Navigating to/);

	await page.evaluate(() => {
		(window as any).RESOLVE_QUERY();
	});

	await expect(body).toHaveText(/Client-side navigation test page A/);

	await expect(button).toHaveText("State test: 1");
});

test("restores scroll position", async ({ page }) => {
	await page.goto("/nav?scroll=1");
	await page.waitForSelector(".hydrated");

	// Scroll to the bottom
	await page.evaluate(() => document.querySelector("footer")?.scrollIntoView());
	await page.waitForFunction(() => window.scrollY > 0);

	const link = await page.locator("a[href='/nav/b']");
	link.click();

	const body = page.locator("body");
	await expect(body).toHaveText(/Client-side navigation test page B/);

	// Make sure it scrolled to the top
	const scrollPos = await page.evaluate(() => window.scrollY);
	expect(scrollPos).toBe(0);

	// Go back to the first page
	await page.goBack();
	await expect(body).toHaveText(/Client-side navigation test page home/);

	// Make sure it scrolls to the bottom
	await page.waitForFunction(() => window.scrollY > 0);
});

test("handles relative links correctly during transitions", async ({
	page,
}) => {
	await page.goto("/nav");
	await page.waitForSelector(".hydrated");

	const link = page.locator("a[href='/nav/a']");
	link.click();

	const body = page.locator("body");
	await expect(body).toHaveText(/Navigating to/);

	const x = await page.evaluate(
		() => (document.getElementById("relative-link") as HTMLAnchorElement).href,
	);
	expect(x).toMatch(/\/relative$/);
});

test("redirects", async ({ page }) => {
	await page.goto("/redirect/shallow");
	const body = page.locator("body");
	await expect(body).toHaveText(/Redirected/);

	await page.goto("/redirect/deep");
	await expect(body).toHaveText(/Redirected/);
});

test("sets redirect status", async ({ baseURL }) => {
	let response = await fetch(baseURL + "/redirect/shallow", {
		headers: { "User-Agent": "rakkasjs-crawler" },
		redirect: "manual",
	});
	expect(response.status).toBe(302);

	response = await fetch(baseURL + "/redirect/deep", {
		headers: { "User-Agent": "rakkasjs-crawler" },
		redirect: "manual",
	});
	expect(response.status).toBe(302);
});

test("sets status and headers", async ({ request }) => {
	const response = await request.get("/response-headers", {
		headers: { "User-Agent": "rakkasjs-crawler" },
	});
	expect(response.status()).toBe(400);
	expect(response.headers()["x-custom-header"]).toBe("Custom value");
});

test("fetches data with useQuery", async ({ page }) => {
	await page.goto("/use-query");
	await page.waitForSelector(".hydrated");

	const content = page.locator("#content");

	await expect(content).toHaveText(/SSR value/);

	const button = page.locator("button");
	await button.click();
	await expect(content).toHaveText(/SSR value \(refetching\)/);

	await button.click();
	await expect(content).toHaveText(/Client value/);
});

test("handles errors in useQuery", async ({ page }) => {
	await page.goto("/use-query/error");
	await page.waitForSelector(".hydrated");

	const content = page.locator("#content");
	await expect(content).toHaveText(/Error!/);

	const button = page.locator("button");
	await button.click();
	await expect(content).toHaveText(/Loading\.\.\./);

	await button.click();
	await expect(content).toHaveText(/Hello world/);
});

test("useQuery refetches on focus", async ({ page }) => {
	await page.goto("/use-query");
	await page.waitForSelector(".hydrated");

	const content = page.locator("#content");
	await expect(content).toHaveText(/SSR value/);

	await new Promise((resolve) => setTimeout(resolve, 200));
	await page.evaluate(() => {
		document.dispatchEvent(new Event("visibilitychange"));
	});

	await expect(content).toHaveText(/SSR value \(refetching\)/);
});

test("useQuery refetches on interval", async ({ page }) => {
	await page.goto("/use-query/interval");
	await page.waitForSelector(".hydrated");

	await page.waitForFunction(() =>
		document.getElementById("content")?.innerText.includes("2"),
	);
});

test("queryClient.setQueryData works", async ({ page }) => {
	await page.goto("/use-query/set-query-data");

	await page.waitForFunction(
		() =>
			document.body?.innerText.includes("AAA") &&
			document.body?.innerText.includes("BBB") &&
			document.body?.innerText.includes("CCC"),
	);
});

test("runs useServerSideQuery on the server", async ({ page }) => {
	await page.goto("/use-ssq");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Result: 7, SSR: true"),
	);

	await page.goto("/use-ssq/elsewhere");
	await page.waitForSelector(".hydrated");

	const link = page.locator("a");
	await link.click();

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Result: 7, SSR: true"),
	);
});

test("runs runServerSideQuery on the server", async ({ page }) => {
	await page.goto("/run-ssq");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Result: 7, SSR: true"),
	);

	await page.goto("/run-ssq/elsewhere");
	await page.waitForSelector(".hydrated");

	const link = page.locator("a");
	await link.click();

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Result: 7, SSR: true"),
	);
});

test("runs useServerSideMutation on the server", async ({ page }) => {
	await page.goto("/use-ssm");
	await page.waitForSelector(".hydrated");

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Not fetched"),
	);

	const btn = page.locator("button");
	expect(btn).toBeTruthy();

	await btn!.click();

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Computed on the server: 14"),
	);
});

test("runs runServerSideMutation on the server", async ({ page }) => {
	await page.goto("/run-ssm");
	await page.waitForSelector(".hydrated");

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Not fetched"),
	);

	const button = page.locator("button");
	await button.click();

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Computed on the server: 7"),
	);
});

test("handles 404", async ({ request }) => {
	const response = await request.get("/not-found");
	expect(response.status()).toBe(404);
	const body = await response.text();
	expect(body).toMatch(/Not Found/);
});

test("handles 404 with layout", async ({ request }) => {
	const response = await request.get("/404/deep");
	expect(response.status()).toBe(404);
	const body = await response.text();
	expect(body).toMatch(/This is a shared header\./);
	expect(body).toMatch(/Deep 404/);
});

test("handles 404 with client-side nav", async ({ page }) => {
	await page.goto("/404/deep/found");
	await page.waitForSelector(".hydrated");

	const link = page.locator("a");
	await link.click();
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Deep 404"),
	);
});

test("handles error", async ({ request }) => {
	const response = await request.get("/error", {
		headers: { "User-Agent": "rakkasjs-crawler" },
	});
	expect(response.status()).toBe(500);
});

test("handles error with message", async ({ page }) => {
	await page.goto("/error");

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Internal Error"),
	);
});

test("handles error with client-side nav", async ({ page }) => {
	await page.goto("/error/intro");
	await page.waitForSelector(".hydrated");
	const link = page.locator("a");
	await link.click();
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Internal Error"),
	);
});

test("mutates with useMutation", async ({ page }) => {
	await page.goto("/use-mutation");
	await page.waitForSelector(".hydrated");

	const button = page.locator("button");
	await button.click();

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Loading"),
	);

	await page.waitForFunction(() => document.body?.innerText.includes("Done"));
});

test("handles useMutation error", async ({ page }) => {
	await page.goto("/use-mutation?error");
	await page.waitForSelector(".hydrated");

	const button = page.locator("button");
	await button.click();

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Loading"),
	);

	await page.waitForFunction(() => document.body?.innerText.includes("Error"));
});

test("route guards work", async ({ page }) => {
	await page.goto("/guard");

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Not Found"),
	);

	await page.goto("/guard?allow-outer");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Not Found"),
	);

	await page.goto("/guard?allow-inner");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Not Found"),
	);

	await page.goto("/guard?allow-outer&allow-inner");
	await page.waitForFunction(() => document.body?.innerText.includes("Found!"));

	await page.goto("/guard?allow-outer&rewrite");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Rewritten!"),
	);

	await page.goto("/guard?allow-outer&redirect");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Redirected!"),
	);
});

test("beforePageLookup redirect works on the server", async ({ baseURL }) => {
	const r = await fetch(baseURL + "/before-route/redirect", {
		redirect: "manual",
	});
	expect(r.status).toBe(302);
	expect(r.headers.get("location")).toBe(baseURL + "/before-route/redirected");
});

test("beforePageLookup redirect works on the client", async ({ page }) => {
	await page.goto("/before-route/redirect");
	await page.waitForSelector(".hydrated");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Redirected"),
	);
});

test("beforePageLookup redirect works with client-side navigation", async ({
	page,
}) => {
	await page.goto("/before-route/links");
	await page.waitForSelector(".hydrated");

	const link = page.locator("a[href='/before-route/redirect']");
	await link.click();

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Redirected"),
	);
});

test("beforePageLookup rewrite works on the server", async ({ request }) => {
	const r = await request.get("/before-route/rewrite");
	const text = await r.text();
	expect(text).toMatch(/Rewritten/);
});

test("beforePageLookup rewrite works on the client", async ({ page }) => {
	await page.goto("/before-route/rewrite");
	await page.waitForSelector(".hydrated");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Rewritten"),
	);
});

test("beforePageLookup rewrite works with client-side navigation", async ({
	page,
}) => {
	await page.goto("/before-route/links");
	await page.waitForSelector(".hydrated");

	const link = page.locator("a[href='/before-route/rewrite']");
	await link.click();

	await page.waitForFunction(() =>
		document.body?.innerText.includes("Rewritten"),
	);
});

test("headers function works", async ({ request }) => {
	const r = await request.get("/headers");
	expect(r.status()).toBe(400);
	expect(r.headers()["x-test-1"]).toBe("1234");
	expect(r.headers()["x-test-2"]).toBe("GET");
});

if (process.env.RUN_TEST !== "dev") {
	test.describe("Static prerendering", () => {
		for (const { url, shouldPrerender } of [
			{ url: "/prerender/bar", shouldPrerender: false },
			{ url: "/prerender/bar-crawled", shouldPrerender: true },
			{ url: "/prerender/foo", shouldPrerender: true },
			{ url: "/prerender/foo-crawled", shouldPrerender: true },
			{ url: "/prerender/not-crawled", shouldPrerender: false },
			{ url: "/prerender/not-prerendered", shouldPrerender: false },
		]) {
			test(url, async ({ request }) => {
				const response = await request.get(url);
				expect(response.status()).toBe(200);
				const text = await response.text();

				if (shouldPrerender) {
					expect(text).toMatch(/This page was prerendered\./);
				} else {
					expect(text).toMatch(/This page was dynamically rendered\./);
				}
			});
		}
	});
}

test("action handlers work", async ({ page }) => {
	await page.goto("/form");
	await page.waitForSelector(".hydrated");

	await page.type("input[name=name]", "wrong");
	await page.click("button[type=submit]");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Incorrect name"),
	);

	await page.evaluate(
		() =>
			((document.querySelector("input[name=name]") as HTMLInputElement).value =
				""),
	);
	await page.type("input[name=name]", "correct");
	await page.click("button[type=submit]");
	await page.waitForFunction(() =>
		document.body?.innerText.includes("Thank you for your feedback!"),
	);
});
