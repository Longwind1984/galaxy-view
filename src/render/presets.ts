// 双视觉方向的全部 token 集中在此（按 Rick 协议：跑起来看着选，G2 门定默认）

export interface VisualTokens {
	id: 'deep-space' | 'daylight';
	background: number;
	starfield: boolean;
	motes: boolean; // 晨昼的尘埃微粒（替代星空）
	bloomEnabled: boolean; // 亮底辉光=雾霾，晨昼强制关
	lightMode: boolean; // 节点 shader 变体：墨水圆盘 + rim
	/** 晨昼把 9 色相重定向到纸面对比度（保色相、压亮度） */
	nodeLightness: number | null;
	linkInk: string | null; // 晨昼链接 = 铅笔线（统一墨色，不用端点混色）
	linkOpacityScale: number;
	panelClass: string; // 面板风格 class
}

export const DEEP_SPACE: VisualTokens = {
	id: 'deep-space',
	background: 0x000003,
	starfield: true,
	motes: false,
	bloomEnabled: true,
	lightMode: false,
	nodeLightness: null,
	linkInk: null,
	linkOpacityScale: 1,
	panelClass: 'gx-theme-dark',
};

export const DAYLIGHT: VisualTokens = {
	id: 'daylight',
	background: 0xf6f4ef, // 暖纸底
	starfield: false,
	motes: true,
	bloomEnabled: false,
	lightMode: true,
	nodeLightness: 0.44,
	linkInk: '#2e2a24',
	linkOpacityScale: 0.65,
	panelClass: 'gx-theme-light',
};
