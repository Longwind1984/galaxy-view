export interface GraphNode {
	id: string; // vault path；未解析为 "unresolved:<名字>"
	name: string;
	folderTop: string; // 顶层文件夹；根目录 ''；未解析 '__unresolved__'
	degree: number;
	unresolved: boolean;
}

/** 边用节点数组下标表示——聚合渲染按索引 gather 坐标 */
export interface GraphLink {
	source: number;
	target: number;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}

export interface LayoutParams {
	charge: number; // 负值=斥力
	linkDistance: number;
	centerPull: number; // forceX/Y/Z 强度，防孤儿飞逸
	velocityDecay: number;
}

export interface FrameStats {
	frames: number;
	avgFps: number;
	p95FrameMs: number;
	worstFrameMs: number;
	durationMs: number;
}

export interface BenchResult {
	scenario: string;
	timestamp: string;
	nodes: number;
	links: number;
	bloom: boolean;
	[key: string]: unknown;
}
