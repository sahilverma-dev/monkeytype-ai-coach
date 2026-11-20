import { isSnapshotRequest, MAIN_SOURCE } from "@/monkeytype/bridge-protocol";
import { buildSnapshotPayload } from "@/monkeytype/main-world";

export default defineContentScript({
	matches: ["https://monkeytype.com/*", "https://www.monkeytype.com/*"],
	runAt: "document_idle",
	world: "MAIN",
	main() {
		window.addEventListener("message", (event: MessageEvent<unknown>) => {
			if (event.source !== window) return;
			if (!isSnapshotRequest(event.data)) return;
			const { requestId } = event.data;
			try {
				window.postMessage(
					{
						source: MAIN_SOURCE,
						type: "TEST_SNAPSHOT",
						requestId,
						payload: buildSnapshotPayload(window, document),
					},
					"*",
				);
			} catch (error) {
				window.postMessage(
					{
						source: MAIN_SOURCE,
						type: "TEST_SNAPSHOT",
						requestId,
						payload: null,
						error: error instanceof Error ? error.message : String(error),
					},
					"*",
				);
			}
		});
	},
});
