import React, { ComponentType } from "react";
import type { RouteRenderArgs } from "@rakkasjs/core";

import pages from "@rakkasjs:pages";
import layouts from "@rakkasjs:layouts";

const trie: any = {};
pages.forEach(([page, importer]) => {
	let name = page.match(/^((.+)[\./])?page\.[a-zA-Z0-9]+$/)![2] || "";
	const segments = name.split("/").filter(Boolean);

	let node = trie;
	for (const segment of segments) {
		if (!node[segment]) {
			node[segment] = {};
		}
		node = node[segment];
	}

	node.$page = importer;
});

layouts.forEach(([layout, importer]) => {
	let name = layout.match(/^((.+)[\./])?layout\.[a-zA-Z0-9]+$/)![2] || "";
	const segments = name.split("/").filter(Boolean);

	let node = trie;
	for (const segment of segments) {
		if (!node[segment]) {
			node[segment] = {};
		}
		node = node[segment];
	}

	node.$layout = importer;
});

console.log("Loaded routes", { pages, layouts });

interface PageOrLayoutModule {
	default: ComponentType;
	load?({ url: URL, params: any }): Promise<any>;
}

export async function findAndRenderRoute(
	{ url }: RouteRenderArgs,
	initialData: any[],
): Promise<{
	params: any;
	stack: Array<{
		component: React.ComponentType<{}>;
		props: any;
	}>;
}> {
	const segments = url.pathname.split("/").filter(Boolean);

	let node = trie;
	const params: any = {};
	const layoutStack: PageOrLayoutModule[] = node.$layout
		? [await node.$layout()]
		: [];

	for (const segment of segments) {
		if (node[segment]) {
			node = node[segment];
		} else {
			let param = Object.keys(node).find(
				(k) => k.startsWith("[") && k.endsWith("]"),
			);

			if (!param)
				return {
					stack: [{ component: () => <p>Page not found</p>, props: {} }],
					params: {},
				};

			node = node[param];
			params[param.slice(1, -1)] = segment;
		}

		if (node.$layout) {
			layoutStack.push(await node.$layout());
		}
	}

	if (!node.$page) {
		return {
			stack: [{ component: () => <p>Page not found</p>, props: {} }],
			params: {},
		};
	}

	const page: PageOrLayoutModule = await node.$page();
	const stack = [...layoutStack, page];
	const props: any[] = [];

	let rendered = 0;

	while (rendered < stack.length) {
		props.push(
			initialData
				? initialData[rendered]
				: stack[rendered].load
				? (await stack[rendered].load({ url, params })).props
				: {},
		);
		rendered++;
	}

	return {
		params,
		stack: stack.map((mdl, i) => ({
			component: mdl.default,
			props: props[i],
		})),
	};
}
