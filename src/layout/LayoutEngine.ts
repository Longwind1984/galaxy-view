import type { GraphData, LayoutParams } from '../types';

/**
 * 布局引擎接口——前人死墙的隔离层。
 * M1: 主线程 d3-force-3d（预算化：每帧一个 tick，布局过程即动画）
 * M3: Web Worker 实现（同接口，positions 经 transferable 回传）
 */
export interface LayoutEngine {
	/** x,y,z × n；引擎原地写入，渲染器直接读 */
	readonly positions: Float32Array;
	init(data: GraphData, positions: Float32Array, params: LayoutParams): void;
	/** 跑一个 tick；返回 false 表示已沉降 */
	step(): boolean;
	isSettled(): boolean;
	/** 数据增量更新后低温重热 */
	reheat(alpha?: number): void;
	dispose(): void;
}
