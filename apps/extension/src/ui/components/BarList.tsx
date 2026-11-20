import type { ReactNode } from "react";

export interface BarItem {
	key: string;
	label: string;
	/** 0..1, drives the bar width. */
	ratio: number;
	value: string;
	hint?: string;
	tone?: "main" | "error";
}

export function BarList(props: { items: BarItem[] }): ReactNode {
	return (
		<div className="mtai-bars">
			{props.items.map((item) => (
				<div key={item.key} className="mtai-bar-row" title={item.hint}>
					<span className="mtai-bar-row__label">{item.label}</span>
					<span className="mtai-bar-row__track">
						<span
							className={
								item.tone === "error"
									? "mtai-bar-row__fill mtai-bar-row__fill--error"
									: "mtai-bar-row__fill"
							}
							style={{
								width: `${Math.max(2, Math.min(100, item.ratio * 100)).toFixed(1)}%`,
								display: "block",
							}}
						/>
					</span>
					<span className="mtai-bar-row__value">{item.value}</span>
				</div>
			))}
		</div>
	);
}
