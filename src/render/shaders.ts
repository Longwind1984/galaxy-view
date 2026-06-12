// 节点 = 单次 draw call 的 THREE.Points + 发光球 shader（NASA「luminous orb」配方）
// 白热核心 + 软边缘；幽灵节点（未解析）无核心、降透明

export const NODE_VERTEX_SHADER = /* glsl */ `
attribute float aSize;
attribute float aGhost;
varying vec3 vColor;
varying float vGhost;
uniform float uPixelScale; // drawingBufferHeight / (2·tan(fov/2))

void main() {
	vColor = color;
	vGhost = aGhost;
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	gl_PointSize = aSize * uPixelScale / max(-mv.z, 1.0);
	gl_Position = projectionMatrix * mv;
}
`;

export const NODE_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vGhost;

void main() {
	vec2 uv = gl_PointCoord - 0.5;
	float d = length(uv);
	float core = smoothstep(0.18, 0.0, d) * 0.55 * (1.0 - vGhost);
	vec3 col = mix(vColor, vec3(1.0), core);
	float alpha = smoothstep(0.5, 0.42, d) * mix(1.0, 0.45, vGhost);
	if (alpha < 0.01) discard;
	gl_FragColor = vec4(col, alpha);
}
`;
