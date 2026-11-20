import { defineConfig } from "wxt";

export default defineConfig({
	srcDir: "src",
	modules: ["@wxt-dev/module-react"],
	zip: {
		artifactTemplate: "monkeytype-ai-companion-{{version}}-{{browser}}.zip",
	},
	manifest: {
		name: "Monkeytype AI Companion",
		short_name: "MT AI",
		description:
			"Your typing data, your AI provider, your personal typing coach. Analytics and AI coaching for Monkeytype.",
		permissions: ["storage"],
		host_permissions: ["https://monkeytype.com/*"],
		optional_host_permissions: [
			"https://api.openai.com/*",
			"https://api.anthropic.com/*",
			"https://generativelanguage.googleapis.com/*",
			"https://openrouter.ai/*",
			"https://api.monkeytype.com/*",
		],
		minimum_chrome_version: "111",
		icons: {
			16: "icon/16.png",
			32: "icon/32.png",
			48: "icon/48.png",
			128: "icon/128.png",
		},
	},
});
