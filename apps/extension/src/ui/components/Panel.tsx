import type { ReactNode } from "react";

export interface TabDefinition {
	id: string;
	label: string;
}

export function Tabs(props: {
	tabs: TabDefinition[];
	active: string;
	onChange: (id: string) => void;
}): ReactNode {
	return (
		<div className="mtai-tabs" role="tablist" aria-label="Sections">
			{props.tabs.map((tab) => (
				<button
					key={tab.id}
					type="button"
					role="tab"
					id={`mtai-tab-${tab.id}`}
					aria-selected={props.active === tab.id}
					aria-controls={`mtai-panel-${tab.id}`}
					onClick={() => props.onChange(tab.id)}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}

export function Panel(props: {
	id?: string;
	title?: string;
	children: ReactNode;
	aside?: ReactNode;
	plain?: boolean;
}): ReactNode {
	return (
		<section
			className={props.plain === true ? "mtai-card mtai-card--plain" : "mtai-card"}
			id={props.id}
			role={props.id === undefined ? undefined : "tabpanel"}
			aria-labelledby={props.id === undefined ? undefined : `mtai-tab-${props.id}`}
		>
			{props.title !== undefined || props.aside !== undefined ? (
				<div className="mtai-row" style={{ marginBottom: "0.6rem" }}>
					{props.title !== undefined ? (
						<h2 className="mtai-card-title">{props.title}</h2>
					) : null}
					{props.aside}
				</div>
			) : null}
			{props.children}
		</section>
	);
}
