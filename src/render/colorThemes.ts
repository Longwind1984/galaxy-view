/**
 * 配色主题：成组的具体配色（G2.5 反馈——靠洗牌不如给经典组合）。
 * 选取标准：在近黑太空底上的呈现效果。非商用项目，大胆借鉴品牌色。
 * 应用方式：按序染给用户的颜色分组（组多于色则循环）。
 */
export interface ColorTheme {
	id: string;
	name: string;
	colors: string[];
}

export const COLOR_THEMES: ColorTheme[] = [
	{
		id: 'hubble',
		name: 'Hubble deep space',
		// 哈勃望远镜假彩色调色板：电离氧青、氢α金、硫离子锈红——天文摄影正统
		colors: ['#46d4dc', '#ffc35c', '#d05a32', '#7fd0a0', '#e8d9a0', '#5a9bd8', '#d87fa8', '#9a7fe0', '#cfd8e8'],
	},
	{
		id: 'tiktok',
		name: 'TikTok neon',
		// TikTok 青/红双主色 + 衍生明度级——黑底霓虹
		colors: ['#25f4ee', '#fe2c55', '#ffffff', '#7ae8e2', '#ff7a9c', '#19b8b2', '#c2244a', '#a8f0ec', '#ffd0dc'],
	},
	{
		id: 'sunset',
		name: 'Sunset film',
		// Instagram 渐变：橙→品红→紫→蓝
		colors: ['#f58529', '#dd2a7b', '#8134af', '#515bd4', '#feda77', '#e1306c', '#c13584', '#fd8d32', '#405de6'],
	},
	{
		id: 'cyber',
		name: 'Cyber city',
		// Cyberpunk 2077：信号黄/电青/警告红
		colors: ['#fcee0a', '#00f0ff', '#ff003c', '#9d00ff', '#00ff9f', '#ff6ec7', '#3df5ff', '#ffe600', '#c800ff'],
	},
	{
		id: 'matrix',
		name: 'Matrix',
		// Matrix 纯绿阶——单色也是品味
		colors: ['#00ff41', '#33ff66', '#00cc34', '#66ff8c', '#00b32d', '#80ffa0', '#1aff4d', '#00e639', '#4dff79'],
	},
	{
		id: 'aurora',
		name: 'Aurora',
		// Spotify 绿 + 冰蓝 + 紫罗兰——高纬夜空
		colors: ['#1db954', '#00d4ff', '#7f5fff', '#38f0c0', '#4fa8ff', '#9f7fff', '#22e6a8', '#66c2ff', '#b08fff'],
	},
];
