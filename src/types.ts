export interface GraphNode {
	id: string; // vault path；未解析为 "unresolved:<名字>"；标签为 "tag:#<名字>"
	name: string;
	folderTop: string; // 顶层文件夹；根目录 ''；未解析 '__unresolved__'；标签 '__tag__'
	degree: number; // 出 + 入
	inDegree: number;
	outDegree: number;
	fileSize: number; // 字节；未解析/标签为 0（「质量」可选依据）
	unresolved: boolean;
	tag: boolean; // true=标签合成节点（非文件），与 unresolved 并列的判别位
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
	linkStrength: number; // 倍率：1 = d3 默认（1/min(端点度数)）
	centerPull: number; // forceX/Y/Z 强度，防孤儿飞逸
	flatten: number; // 0=自然球体；>0 在 Y 轴额外加压 → 银河盘（自然引斥力做不出盘，这是必要的额外力）
	coreGravity: number; // 径向核心引力：致密亮核 + 径向密度梯度（度数加权，hub 沉核）
	spiral: number; // 切向旋臂力：把盘梳成对数旋臂（0=无臂）
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
