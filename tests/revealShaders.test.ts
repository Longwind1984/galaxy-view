import { describe, expect, it } from 'vitest';
import { ShaderLib } from 'three';
import { patchRevealLineShader, type RevealLineShader, type RevealLineUniforms } from '../src/render/shaders';

const uniforms: RevealLineUniforms = {
	uLinkCurvature: { value: 0.35 },
	uRevealActive: { value: 1 },
	uRevealProgress: { value: 0.5 },
	uRevealMaxRadius: { value: 100 },
};

describe('reveal line shader patch', () => {
	it('patches only the native vertex position hook and preserves the full fragment pipeline', () => {
		const shader: RevealLineShader = {
			uniforms: {},
			vertexShader: 'void main() {\n#include <begin_vertex>\n#include <project_vertex>\n}',
			fragmentShader: [
				'void main() {',
				'#include <tonemapping_fragment>',
				'#include <colorspace_fragment>',
				'#include <fog_fragment>',
				'}',
			].join('\n'),
		};
		const originalFragment = shader.fragmentShader;
		patchRevealLineShader(shader, uniforms);

		expect(shader.vertexShader).toContain('attribute vec3 aSourcePosition');
		expect(shader.vertexShader).toContain('vec3 transformed = curvePosition');
		expect(shader.vertexShader).not.toContain('#include <begin_vertex>');
		expect(shader.fragmentShader).toBe(originalFragment);
		expect(shader.uniforms['uRevealProgress']).toBe(uniforms.uRevealProgress);
	});

	it('fails loudly if a future Three upgrade changes the shader hook contract', () => {
		const shader: RevealLineShader = {
			uniforms: {},
			vertexShader: 'void main() {}',
			fragmentShader: 'void main() {}',
		};
		expect(() => patchRevealLineShader(shader, uniforms)).toThrow(/anchors changed/);
	});

	it.each(['basic', 'dashed'] as const)('matches the installed Three r184 %s shader contract', (kind) => {
		const native = ShaderLib[kind];
		const shader: RevealLineShader = {
			uniforms: { ...native.uniforms },
			vertexShader: native.vertexShader,
			fragmentShader: native.fragmentShader,
		};
		patchRevealLineShader(shader, uniforms);
		expect(shader.vertexShader).toContain('vec3 transformed = curvePosition');
		expect(shader.fragmentShader).toContain('#include <tonemapping_fragment>');
		expect(shader.fragmentShader).toContain('#include <colorspace_fragment>');
	});
});
