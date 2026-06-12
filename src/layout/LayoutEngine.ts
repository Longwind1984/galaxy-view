import type { GraphData, LayoutParams } from '../types';

/**
 * 布局引擎接口——前人死墙的隔离层。
 * M1: 主线程 d3-force-3d（预算化：每帧一个 tick，布局过程即动画）
 * M3: Web Worker 实现（同接口，positions 经 transferable 回传）
 */
export interface LayoutEngine {
	/** x,y,z × n；引擎原地写入，渲染器直接读 */
	readonly positions: Float32Array;
	/** 自 init 起累计 tick 数（基准用，替代运行时方法替换 hack） */
	readonly ticks: number;
	/** initialAlpha: 1=完整冷布局；低值（如 0.06 暖启动 / 0.3 增量更新）= 温和整理 */
	init(data: GraphData, positions: Float32Array, params: LayoutParams, initialAlpha?: number): void;
	/** 跑一个 tick；返回 false 表示已沉降 */
	step(): boolean;
	isSettled(): boolean;
	/** 数据增量更新后低温重热 */
	reheat(alpha?: number): void;
	/** 实时调参（控制面板滑杆）：更新力参数并重热，星系当场重排 */
	updateParams(params: LayoutParams): void;
	dispose(): void;
}
