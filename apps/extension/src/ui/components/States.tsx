import type { ReactNode } from "react";

export function EmptyState(props: {
	title: string;
	children?: ReactNode;
	steps?: string[];
}): ReactNode {
	return (
		<div className="mtai-empty">
			<h2>{props.title}</h2>
			{props.children}
			{props.steps !== undefined ? (
				<ol>
					{props.steps.map((step) => (
						<li key={step}>{step}</li>
					))}
				</ol>
			) : null}
		</div>
	);
}

export function ErrorState(props: { message: string }): ReactNode {
	return (
		<div className="mtai-error" role="alert">
			{props.message}
		</div>
	);
}
