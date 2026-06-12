declare module 'd3-force-3d' {
	export interface SimNode {
		index?: number;
		x?: number;
		y?: number;
		z?: number;
		vx?: number;
		vy?: number;
		vz?: number;
		fx?: number | null;
		fy?: number | null;
		fz?: number | null;
	}
	export interface SimLink<N extends SimNode = SimNode> {
		source: number | N;
		target: number | N;
		index?: number;
	}

	export interface Force<N extends SimNode = SimNode> {
		(alpha: number): void;
		initialize?(nodes: N[], random: () => number, nDim: number): void;
	}

	export interface Simulation<N extends SimNode = SimNode> {
		tick(iterations?: number): this;
		restart(): this;
		stop(): this;
		nodes(): N[];
		nodes(nodes: N[]): this;
		alpha(): number;
		alpha(alpha: number): this;
		alphaMin(): number;
		alphaMin(min: number): this;
		alphaDecay(): number;
		alphaDecay(decay: number): this;
		alphaTarget(): number;
		alphaTarget(target: number): this;
		velocityDecay(): number;
		velocityDecay(decay: number): this;
		force(name: string): Force<N> | undefined;
		force(name: string, force: Force<N> | null): this;
		on(typenames: string, listener: ((this: this) => void) | null): this;
	}

	export interface LinkForce<N extends SimNode = SimNode> extends Force<N> {
		links(): SimLink<N>[];
		links(links: SimLink<N>[]): this;
		distance(d: number | ((link: SimLink<N>) => number)): this;
		strength(s: number | ((link: SimLink<N>) => number)): this;
	}

	export interface ManyBodyForce<N extends SimNode = SimNode> extends Force<N> {
		strength(s: number | ((node: N) => number)): this;
		theta(t: number): this;
		distanceMax(d: number): this;
	}

	export interface PositionForce<N extends SimNode = SimNode> extends Force<N> {
		strength(s: number | ((node: N) => number)): this;
		x?(v: number): this;
		y?(v: number): this;
		z?(v: number): this;
	}

	export interface CenterForce<N extends SimNode = SimNode> extends Force<N> {
		x(v: number): this;
		y(v: number): this;
		z(v: number): this;
		strength(s: number): this;
	}

	export function forceSimulation<N extends SimNode = SimNode>(
		nodes?: N[],
		numDimensions?: 1 | 2 | 3,
	): Simulation<N>;
	export function forceLink<N extends SimNode = SimNode>(links?: SimLink<N>[]): LinkForce<N>;
	export function forceManyBody<N extends SimNode = SimNode>(): ManyBodyForce<N>;
	export function forceCenter<N extends SimNode = SimNode>(x?: number, y?: number, z?: number): CenterForce<N>;
	export function forceX<N extends SimNode = SimNode>(x?: number): PositionForce<N>;
	export function forceY<N extends SimNode = SimNode>(y?: number): PositionForce<N>;
	export function forceZ<N extends SimNode = SimNode>(z?: number): PositionForce<N>;
	export function forceCollide<N extends SimNode = SimNode>(radius?: number): Force<N>;
	export function forceRadial<N extends SimNode = SimNode>(
		radius: number,
		x?: number,
		y?: number,
		z?: number,
	): Force<N>;
}
