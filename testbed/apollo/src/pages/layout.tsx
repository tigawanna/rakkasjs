import React, { useEffect } from "react";
import { defineLayout, NavLink } from "rakkasjs";

export default defineLayout({
	Component: function MainLayout({ error, children }) {
		useEffect(() => {
			document.body.classList.add("hydrated");
		}, []);

		const content = error || children;

		return (
			<div>
				<main>{content}</main>
				<nav>
					<ul>
						<li>
							<NavLink href="/" currentRouteStyle={{ fontWeight: "bold" }}>
								Home page
							</NavLink>
						</li>
						<li>
							<NavLink href="/other" currentRouteStyle={{ fontWeight: "bold" }}>
								Other page
							</NavLink>
						</li>
					</ul>
				</nav>
			</div>
		);
	},
});