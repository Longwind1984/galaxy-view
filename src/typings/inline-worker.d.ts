// esbuild inline-worker 插件：'worker:' 前缀的导入被打包成 IIFE 文本字符串
declare module 'worker:*' {
	const source: string;
	export default source;
}
