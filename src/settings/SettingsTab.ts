// 经典 PluginSettingTab（覆写 display）：声明式 getSettingDefinitions 需 1.13.0，我们下限 1.8.7 故用经典 API。
// 为不触碰任何「弃用调用」：内部重绘走私有 render()（而非再调 display()），销毁按钮用 mod-warning 类（而非 setWarning()）。
import { Notice, PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type GalaxyViewPlugin from '../main';
import { VIEW_TYPE_GALAXY } from '../constants';
import { GalaxyView } from '../view/GalaxyView';
import { mergeSettings } from '../settings';
import { resolveLang, setLang, t } from '../i18n';

/**
 * 设置页承载「耐久偏好」：语言、画质、视觉模式、显示孤儿/未解析、全部重置。
 * 实时微调（滑杆/风格/配色/巡航）仍在画布上的浮动面板。两者读写同一 settings。
 */
export class GalaxySettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: GalaxyViewPlugin,
	) {
		super(app, plugin);
	}

	/** 把改动推给所有已打开的星系视图 */
	private eachView(fn: (v: GalaxyView) => void): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GALAXY)) {
			if (leaf.view instanceof GalaxyView) fn(leaf.view);
		}
	}

	display(): void {
		this.render();
	}

	private render(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		new Setting(containerEl)
			.setName(t('set.language'))
			.setDesc(t('set.language.desc'))
			.addDropdown((d) =>
				d
					.addOption('auto', t('set.language.auto'))
					.addOption('en', t('set.language.en'))
					.addOption('zh', t('set.language.zh'))
					.setValue(s.language)
					.onChange(async (v) => {
						s.language = v === 'en' || v === 'zh' ? v : 'auto';
						setLang(resolveLang(s.language));
						await this.plugin.saveSettings();
						this.eachView((view) => view.controller?.rebuildPanel());
						new Notice(t('set.langChanged'));
						this.render(); // 用新语言重绘本页
					}),
			);

		new Setting(containerEl)
			.setName(t('set.quality'))
			.setDesc(t('set.quality.desc'))
			.addDropdown((d) =>
				d
					.addOption('auto', t('q.auto'))
					.addOption('high', t('q.high'))
					.addOption('low', t('q.low'))
					.addOption('mobile', t('q.mobile'))
					.setValue(s.qualityOverride)
					.onChange(async (v) => {
						s.qualityOverride = v === 'high' || v === 'low' || v === 'mobile' ? v : 'auto';
						await this.plugin.saveSettings();
						this.eachView((view) => view.controller?.syncFromSettings());
					}),
			);

		new Setting(containerEl)
			.setName(t('set.preset'))
			.setDesc(t('set.preset.desc'))
			.addDropdown((d) =>
				d
					.addOption('deep-space', t('set.preset.deepSpace'))
					.addOption('adaptive', t('set.preset.adaptive'))
					.setValue(s.preset)
					.onChange(async (v) => {
						s.preset = v === 'adaptive' ? 'adaptive' : 'deep-space';
						await this.plugin.saveSettings();
						this.eachView((view) => view.controller?.syncFromSettings());
					}),
			);

		new Setting(containerEl)
			.setName(t('set.orphans'))
			.setDesc(t('set.orphans.desc'))
			.addToggle((tg) =>
				tg.setValue(s.showOrphans).onChange(async (v) => {
					s.showOrphans = v;
					await this.plugin.saveSettings();
					this.eachView((view) => view.controller?.syncFromSettings());
				}),
			);

		new Setting(containerEl)
			.setName(t('set.unresolved'))
			.setDesc(t('set.unresolved.desc'))
			.addToggle((tg) =>
				tg.setValue(s.showUnresolved).onChange(async (v) => {
					s.showUnresolved = v;
					await this.plugin.saveSettings();
					this.eachView((view) => view.controller?.syncFromSettings());
				}),
			);

		new Setting(containerEl)
			.setName(t('set.starfield'))
			.setDesc(t('set.starfield.desc'))
			.addToggle((tg) =>
				tg.setValue(s.showStarfield).onChange(async (v) => {
					s.showStarfield = v;
					await this.plugin.saveSettings();
					this.eachView((view) => view.controller?.syncFromSettings());
				}),
			);

		new Setting(containerEl)
			.setName(t('set.reset'))
			.setDesc(t('set.reset.desc'))
			.addButton((b) => {
				b.setButtonText(t('set.reset.cta'));
				b.buttonEl.addClass('mod-warning'); // setWarning() 的免弃用等价：直接加销毁色类
				b.onClick(async () => {
					// mergeSettings 会重新构造全部嵌套对象（避免与 DEFAULT_SETTINGS 共享引用）；
					// 保留语言与暖启动坐标缓存，其余回默认。原地 Object.assign 让已开视图看到更新。
					const fresh = mergeSettings({ language: s.language, positionCache: s.positionCache });
					Object.assign(this.plugin.settings, fresh);
					await this.plugin.saveSettings();
					this.eachView((view) => view.controller?.syncFromSettings());
					this.render();
				});
			});
	}
}
