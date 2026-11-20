import type { ReactNode } from "react";

export function Stat(props: {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	plain?: boolean;
}): ReactNode {
	return (
		<div className={props.plain === true ? "mtai-stat mtai-stat--plain" : "mtai-stat"}>
			<span className="mtai-stat__label">{props.label}</span>
			<span className="mtai-stat__value">{props.value}</span>
			{props.hint !== undefined ? (
				<span className="mtai-stat__hint">{props.hint}</span>
			) : null}
		</div>
	);
}

export function StatGrid(props: { children: ReactNode }): ReactNode {
	return <div className="mtai-stat-grid">{props.children}</div>;
}
