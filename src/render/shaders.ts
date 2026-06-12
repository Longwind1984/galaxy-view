// 节点 = 单次 draw call 的 THREE.Points + 发光球 shader（NASA「luminous orb」配方）
// 深空模式：白热核心 + 软边缘；浅色「晨昼」模式：实心墨水圆盘 + 深色 rim（bloom 关）
// aDim: 聚焦模式下非邻居淡出（0.12..1）

export const NODE_VERTEX_SHADER = /* glsl */ `
attribute float aSize;
attribute float aGhost;
attribute float aDim;
varying vec3 vColor;
varying float vGhost;
varying float vDim;
uniform float uPixelScale; // drawingBufferHeight / (2·tan(fov/2))
uniform float uSizeMul; // 控制面板「节点大小」倍率
uniform float uMaxPoint; // 设备像素钳制：穿行星团时防满屏大精灵打爆填充率（M3）

void main() {
	vColor = color;
	vGhost = aGhost;
	vDim = aDim;
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	gl_PointSize = min(aSize * uSizeMul * uPixelScale / max(-mv.z, 1.0), uMaxPoint);
	gl_Position = projectionMatrix * mv;
}
`;

export const NODE_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vGhost;
varying float vDim;
uniform float uLightMode; // 0 = 深空（白热核心），1 = 晨昼（墨水圆盘 + rim）

void main() {
	vec2 uv = gl_PointCoord - 0.5;
	float d = length(uv);

	float core = smoothstep(0.18, 0.0, d) * 0.55 * (1.0 - vGhost) * (1.0 - uLightMode);
	vec3 col = mix(vColor, vec3(1.0), core);

	// 晨昼：外缘 1px 深色 rim，让节点「坐在纸上」
	float rim = smoothstep(0.40, 0.46, d) * smoothstep(0.50, 0.46, d);
	col = mix(col, col * 0.72, rim * uLightMode);

	float alpha = smoothstep(0.5, 0.42, d) * mix(1.0, 0.45, vGhost) * vDim;
	if (alpha < 0.01) discard;
	gl_FragColor = vec4(col, alpha);
}
`;
