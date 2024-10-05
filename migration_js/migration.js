import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
	name: "Comfy.ManagerExtMenu",
	init() {
		$el("style", {
			textContent: style,
			parent: document.head,
		});
	},
	async setup() {
			let cmGroup = new (await import("../../scripts/ui/components/buttonGroup.js")).ComfyButtonGroup(
				new(await import("../../scripts/ui/components/button.js")).ComfyButton({
					icon: "puzzle",
					action: async () => {
						if(confirm('As some features of ComfyUI Manager have been integrated into ComfyUI, they have been separated into manager-core.\n\nComfyUI Manager only includes additional extension features that are not provided by manager-core.\n\nWill you install manager-core?')) {
							app.ui.dialog.show('Installing manager-core...');
							app.ui.dialog.element.style.zIndex = 10010;

							await api.fetchApi("/manager/install_manager_core");

							app.ui.dialog.show('The installation of manager-core will be completed after restarting.');
						}
					},
					tooltip: "Need to install manager-core",
					content: "Manager (Need To Install)",
					classList: "comfyui-button comfyui-menu-mobile-collapse primary"
				}).element
			);

			app.menu?.settingsGroup.element.before(cmGroup.element);
	}
});