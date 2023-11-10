import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"
import { ComfyDialog, $el } from "../../scripts/ui.js";
import { ShareDialog, SUPPORTED_OUTPUT_NODE_TYPES, getPotentialOutputsAndOutputNodes } from "./comfyui-share.js";
import { CustomNodesInstaller } from "./custom-nodes-downloader.js";
import { AlternativesInstaller } from "./a1111-alter-downloader.js";
import { SnapshotManager } from "./snapshot.js";
import { ModelInstaller } from "./model-downloader.js";
import { manager_instance, setManagerInstance, install_via_git_url } from  "./common.js";

var docStyle = document.createElement('style');
docStyle.innerHTML = `
.cm-menu-container {
  column-gap: 20px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}

.cm-menu-column {
  display: flex;
  flex-direction: column;
}

.cm-title {
	padding: 10px 10px 0 10p;
	background-color: black;
	text-align: center;
	height: 45px;
}
`;

document.head.appendChild(docStyle);

var update_comfyui_button = null;
var fetch_updates_button = null;
var update_all_button = null;
var badge_mode = "none";

// copied style from https://github.com/pythongosssss/ComfyUI-Custom-Scripts
const style = `
#comfyworkflows-button {
	position: relative;
	overflow: hidden;
 } 
.pysssss-workflow-arrow-2 {
   position: absolute;
   top: 0;
   bottom: 0;
   right: 0;
   font-size: 12px;
   display: flex;
   align-items: center;
   width: 24px;
   justify-content: center;
   background: rgba(255,255,255,0.1);
   content: "▼";
}
.pysssss-workflow-arrow-2:after {
	content: "▼";
 }
 .pysssss-workflow-arrow-2:hover {
	filter: brightness(1.6);
	background-color: var(--comfy-menu-bg);
 }
.pysssss-workflow-popup-2 ~ .litecontextmenu {
	transform: scale(1.3);
}
#comfyworkflows-button-menu {
	z-index: 10000000000 !important;
}
`;



async function init_badge_mode() {
	api.fetchApi('/manager/badge_mode')
		.then(response => response.text())
		.then(data => { badge_mode = data; })
}

await init_badge_mode();


async function fetchNicknames() {
	const response1 = await api.fetchApi(`/customnode/getmappings?mode=local`);
	const mappings = await response1.json();

	let result = {};

	for (let i in mappings) {
		let item = mappings[i];
		var nickname;
		if (item[1].title) {
			nickname = item[1].title;
		}
		else {
			nickname = item[1].title_aux;
		}

		for (let j in item[0]) {
			result[item[0][j]] = nickname;
		}
	}

	return result;
}

let nicknames = await fetchNicknames();


async function updateComfyUI() {
	let prev_text = update_comfyui_button.innerText;
	update_comfyui_button.innerText = "Updating ComfyUI...";
	update_comfyui_button.disabled = true;
	update_comfyui_button.style.backgroundColor = "gray";

	try {
		const response = await api.fetchApi('/comfyui_manager/update_comfyui');

		if (response.status == 400) {
			app.ui.dialog.show('Failed to update ComfyUI.');
			app.ui.dialog.element.style.zIndex = 10010;
			return false;
		}

		if (response.status == 201) {
			app.ui.dialog.show('ComfyUI has been successfully updated.');
			app.ui.dialog.element.style.zIndex = 10010;
		}
		else {
			app.ui.dialog.show('ComfyUI is already up to date with the latest version.');
			app.ui.dialog.element.style.zIndex = 10010;
		}

		return true;
	}
	catch (exception) {
		app.ui.dialog.show(`Failed to update ComfyUI / ${exception}`);
		app.ui.dialog.element.style.zIndex = 10010;
		return false;
	}
	finally {
		update_comfyui_button.disabled = false;
		update_comfyui_button.innerText = prev_text;
		update_comfyui_button.style.backgroundColor = "";
	}
}

async function fetchUpdates(update_check_checkbox) {
	let prev_text = fetch_updates_button.innerText;
	fetch_updates_button.innerText = "Fetching updates...";
	fetch_updates_button.disabled = true;
	fetch_updates_button.style.backgroundColor = "gray";

	try {
		var mode = "url";
        if(manager_instance.local_mode_checkbox.checked)
            mode = "local";

		const response = await api.fetchApi(`/customnode/fetch_updates?mode=${mode}`);

		if (response.status != 200 && response.status != 201) {
			app.ui.dialog.show('Failed to fetch updates.');
			app.ui.dialog.element.style.zIndex = 10010;
			return false;
		}

		if (response.status == 201) {
			app.ui.dialog.show('There is an updated extension available.');
			app.ui.dialog.element.style.zIndex = 10010;
			update_check_checkbox.checked = false;
		}
		else {
			app.ui.dialog.show('All extensions are already up-to-date with the latest versions.');
			app.ui.dialog.element.style.zIndex = 10010;
		}

		return true;
	}
	catch (exception) {
		app.ui.dialog.show(`Failed to update custom nodes / ${exception}`);
		app.ui.dialog.element.style.zIndex = 10010;
		return false;
	}
	finally {
		fetch_updates_button.disabled = false;
		fetch_updates_button.innerText = prev_text;
		fetch_updates_button.style.backgroundColor = "";
	}
}

async function updateAll(update_check_checkbox) {
	let prev_text = update_all_button.innerText;
	update_all_button.innerText = "Updating all...(ComfyUI)";
	update_all_button.disabled = true;
	update_all_button.style.backgroundColor = "gray";

	try {
		var mode = "url";
        if(manager_instance.local_mode_checkbox.checked)
            mode = "local";

		update_all_button.innerText = "Updating all...";
		const response1 = await api.fetchApi('/comfyui_manager/update_comfyui');
		const response2 = await api.fetchApi(`/customnode/update_all?mode=${mode}`);

		if (response1.status != 200 && response2.status != 201) {
			app.ui.dialog.show('Failed to update ComfyUI or several extensions.<BR><BR>See terminal log.<BR>');
			app.ui.dialog.element.style.zIndex = 10010;
			return false;
		}
		if(response1.status == 201 || response2.status == 201) {
	        app.ui.dialog.show('ComfyUI and all extensions have been updated to the latest version.');
			app.ui.dialog.element.style.zIndex = 10010;
		}
		else {
			app.ui.dialog.show('ComfyUI and all extensions are already up-to-date with the latest versions.');
	        app.ui.dialog.element.style.zIndex = 10010;
        }

		return true;
	}
	catch (exception) {
		app.ui.dialog.show(`Failed to update ComfyUI or several extensions / ${exception}`);
		app.ui.dialog.element.style.zIndex = 10010;
		return false;
	}
	finally {
		update_all_button.disabled = false;
		update_all_button.innerText = prev_text;
		update_all_button.style.backgroundColor = "";
	}
}

function newDOMTokenList(initialTokens) {
	const tmp = document.createElement(`div`);
  
	const classList = tmp.classList;
	if (initialTokens) {
	  initialTokens.forEach(token => {
		classList.add(token);
	  });
	}
  
	return classList;
  }  


// -----------
class ManagerMenuDialog extends ComfyDialog {
	local_mode_checkbox = null;

	createControlsMid() {
		update_comfyui_button =
			$el("button", {
				type: "button",
				textContent: "Update ComfyUI",
				onclick:
					() => updateComfyUI()
			});

		fetch_updates_button =
			$el("button", {
				type: "button",
				textContent: "Fetch Updates",
				onclick:
					() => fetchUpdates(this.update_check_checkbox)
			});

		update_all_button =
			$el("button", {
				type: "button",
				textContent: "Update All",
				onclick:
					() => updateAll(this.update_check_checkbox)
			});

		const res =
			[
				$el("button", {
					type: "button",
					textContent: "Install Custom Nodes",
					onclick:
						() => {
							if(!CustomNodesInstaller.instance)
								CustomNodesInstaller.instance = new CustomNodesInstaller(app);
							CustomNodesInstaller.instance.show(false);
						}
				}),

				$el("button", {
					type: "button",
					textContent: "Install Missing Custom Nodes",
					onclick:
						() => {
							if(!CustomNodesInstaller.instance)
								CustomNodesInstaller.instance = new CustomNodesInstaller(app);
							CustomNodesInstaller.instance.show(true);
						}
				}),

				$el("button", {
					type: "button",
					textContent: "Install Models",
					onclick:
						() => {
							if(!ModelInstaller.instance)
								ModelInstaller.instance = new ModelInstaller(app);
							ModelInstaller.instance.show();
						}
				}),

                $el("br", {}, []),
				update_all_button,
				update_comfyui_button,
				fetch_updates_button,

				$el("br", {}, []),
				$el("button", {
					type: "button",
					textContent: "Alternatives of A1111",
					onclick:
						() => {
							if(!AlternativesInstaller.instance)
								AlternativesInstaller.instance = new AlternativesInstaller(app);
							AlternativesInstaller.instance.show();
						}
				}),

				$el("br", {}, []),
			];

		return res;
	}

	createControlsLeft() {
		this.local_mode_checkbox = $el("input",{type:'checkbox', id:"use_local_db"},[])
		const checkbox_text = $el("label",{},[" Use local DB"])
		checkbox_text.style.color = "var(--fg-color)";
		checkbox_text.style.marginRight = "10px";

		this.update_check_checkbox = $el("input",{type:'checkbox', id:"skip_update_check"},[])
		const uc_checkbox_text = $el("label",{},[" Skip update check"])
		uc_checkbox_text.style.color = "var(--fg-color)";
		this.update_check_checkbox.checked = true;

		// preview method
		let preview_combo = document.createElement("select");
		preview_combo.appendChild($el('option', { value: 'auto', text: 'Preview method: Auto' }, []));
		preview_combo.appendChild($el('option', { value: 'taesd', text: 'Preview method: TAESD (slow)' }, []));
		preview_combo.appendChild($el('option', { value: 'latent2rgb', text: 'Preview method: Latent2RGB (fast)' }, []));
		preview_combo.appendChild($el('option', { value: 'none', text: 'Preview method: None (very fast)' }, []));

		api.fetchApi('/manager/preview_method')
			.then(response => response.text())
			.then(data => { preview_combo.value = data; })

		preview_combo.addEventListener('change', function (event) {
			api.fetchApi(`/manager/preview_method?value=${event.target.value}`);
		});

		// nickname
		let badge_combo = document.createElement("select");
		badge_combo.appendChild($el('option', { value: 'none', text: 'Badge: None' }, []));
		badge_combo.appendChild($el('option', { value: 'nick', text: 'Badge: Nickname' }, []));
		badge_combo.appendChild($el('option', { value: 'id_nick', text: 'Badge: #ID Nickname' }, []));

		api.fetchApi('/manager/badge_mode')
			.then(response => response.text())
			.then(data => { badge_combo.value = data; badge_mode = data; });

		badge_combo.addEventListener('change', function (event) {
			api.fetchApi(`/manager/badge_mode?value=${event.target.value}`);
			badge_mode = event.target.value;
			app.graph.setDirtyCanvas(true);
		});

		// channel
		let channel_combo = document.createElement("select");
		api.fetchApi('/manager/channel_url_list')
			.then(response => response.json())
			.then(async data => {
				try {
					let urls = data.list;
					for (let i in urls) {
						if (urls[i] != '') {
							let name_url = urls[i].split('::');
							channel_combo.appendChild($el('option', { value: name_url[0], text: `Channel: ${name_url[0]}` }, []));
						}
					}

					channel_combo.addEventListener('change', function (event) {
						api.fetchApi(`/manager/channel_url_list?value=${event.target.value}`);
					});

					channel_combo.value = data.selected;
				}
				catch (exception) {

				}
			});

		return [
			$el("div", {}, [this.local_mode_checkbox, checkbox_text, this.update_check_checkbox, uc_checkbox_text]),
			$el("br", {}, []),
			preview_combo,
			badge_combo,
			channel_combo,

			$el("hr", {}, []),
			$el("center", {}, ["!! EXPERIMENTAL !!"]),
			$el("br", {}, []),
			$el("button", {
				type: "button",
				textContent: "Snapshot Manager",
				onclick:
					() => {
						if(!SnapshotManager.instance)
						SnapshotManager.instance = new SnapshotManager(app);
						SnapshotManager.instance.show();
					}
			}),
			$el("button", {
				type: "button",
				textContent: "Install via Git URL",
				onclick: () => {
					var url = prompt("Please enter the URL of the Git repository to install", "");

					if (url !== null) {
						install_via_git_url(url);
					}
				}
			}),
		];
	}

	createControlsRight() {
		return [
				$el("button", {
					type: "button",
					textContent: "ComfyUI Community Manual",
					onclick: () => { window.open("https://blenderneko.github.io/ComfyUI-docs/", "comfyui-community-manual"); }
				}),

				$el("button", {
					id: 'comfyworkflows-button',
					type: "button",
					textContent: "ComfyUI Workflow Gallery",
					onclick: () => { window.open("https://comfyworkflows.com/", "comfyui-workflow-gallery"); }
				}, [
					$el("div.pysssss-workflow-arrow-2", {
						id: `comfyworkflows-button-arrow`,
						// parent: document.getElementById(`comfyworkflows-button`),
						onclick: (e) => {
							e.preventDefault();
							e.stopPropagation();

							LiteGraph.closeAllContextMenus();
							const menu = new LiteGraph.ContextMenu(
								[
									{
										title: "Share your art",
										callback: () => {
											this.close();
											if (!ShareDialog.instance) {
												ShareDialog.instance = new ShareDialog();
											}
								
											app.graphToPrompt().then(prompt => {
												// console.log({ prompt })
												return app.graph._nodes;
											}).then(nodes => {
												// console.log({ nodes });
												const { potential_outputs, potential_output_nodes } = getPotentialOutputsAndOutputNodes(nodes);
								
												if (potential_outputs.length === 0) {
													if (potential_output_nodes.length === 0) {
														// todo: add support for other output node types (animatediff combine, etc.)
														const supported_nodes_string = SUPPORTED_OUTPUT_NODE_TYPES.join(", ");
														alert(`No supported output node found (${supported_nodes_string}). To share this workflow, please add an output node to your graph and re-run your prompt.`);
													} else {
														alert("To share this, first run a prompt. Once it's done, click 'Share'.");
													}
													return;
												}
								
												ShareDialog.instance.show({ potential_outputs, potential_output_nodes });
											});
										},
									},
									{
										title: "Close",
										callback: () => {
											this.close();
										},
									}
								],
								{
									event: e,
									scale: 1.3,
								},
								window
							);
							// set the id so that we can override the context menu's z-index to be above the comfyui manager menu
							menu.root.id = "comfyworkflows-button-menu";
							menu.root.classList.add("pysssss-workflow-popup-2");
						},
					})
				]),

				$el("button", {
					type: "button",
					textContent: "ComfyUI Nodes Info",
					onclick: () => { window.open("https://ltdrdata.github.io/", "comfyui-node-info"); }
				}),
		];
	}

	constructor() {
		super();

		const close_button = $el("button", { type: "button", textContent: "Close", onclick: () => this.close() });
		close_button.style.position = "absolute";
		close_button.style.bottom = "20px";
		close_button.style.width = "calc(100% - 60px)";

		const content =
				$el("div.comfy-modal-content",
					[
						$el("tr.cm-title", {width:"100%"}, [
								$el("font", {size:6, color:"white"}, [`ComfyUI Manager Menu`])]
							),
						$el("br", {}, []),
						$el("div.cm-menu-container",
							[
								$el("div.cm-menu-column", [...this.createControlsLeft()]),
								$el("div.cm-menu-column", [...this.createControlsMid()]),
								$el("div.cm-menu-column", [...this.createControlsRight()])
							]),
						close_button,
					]
				);

		content.style.width = '100%';
		content.style.height = '100%';

		this.element = $el("div.comfy-modal", { parent: document.body }, [ content ]);
		this.element.style.width = '1000px';
		this.element.style.height = '400px';
		this.element.style.zIndex = 10000;
	}

	show() {
		this.element.style.display = "block";
	}
}


app.registerExtension({
	name: "Comfy.ManagerMenu",
	init() {
		$el("style", {
			textContent: style,
			parent: document.head,
		});
	},
	async setup() {
		const menu = document.querySelector(".comfy-menu");
		const separator = document.createElement("hr");

		separator.style.margin = "20px 0";
		separator.style.width = "100%";
		menu.append(separator);

		const managerButton = document.createElement("button");
		managerButton.textContent = "Manager";
		managerButton.onclick = () => {
				if(!manager_instance)
					setManagerInstance(new ManagerMenuDialog());
				manager_instance.show();
			}
		menu.append(managerButton);


		const shareButton = document.createElement("button");
		shareButton.textContent = "Share";
		shareButton.onclick = () => {
			if (!ShareDialog.instance) {
				ShareDialog.instance = new ShareDialog();
			}

			app.graphToPrompt().then(prompt => {
				// console.log({ prompt })
				return app.graph._nodes;
			}).then(nodes => {
				// console.log({ nodes });
				const { potential_outputs, potential_output_nodes } = getPotentialOutputsAndOutputNodes(nodes);

				if (potential_outputs.length === 0) {
					if (potential_output_nodes.length === 0) {
						// todo: add support for other output node types (animatediff combine, etc.)
						const supported_nodes_string = SUPPORTED_OUTPUT_NODE_TYPES.join(", ");
						alert(`No supported output node found (${supported_nodes_string}). To share this workflow, please add an output node to your graph and re-run your prompt.`);
					} else {
						alert("To share this, first run a prompt. Once it's done, click 'Share'.\n\nNOTE: Images of the Share target can only be selected in the PreviewImage, SaveImage, and VHS_VideoCombine nodes. In the case of VHS_VideoCombine, only the image/gif and image/webp formats are supported.");
					}
					return;
				}

				ShareDialog.instance.show({ potential_outputs, potential_output_nodes });
			});
		}
		// make the background color a gradient of blue to green
		shareButton.style.background = "linear-gradient(90deg, #00C9FF 0%, #92FE9D 100%)";
		shareButton.style.color = "black";

		app.ui.settings.addSetting({
			id: "ComfyUIManager.ShowShareButtonInMainMenu",
			name: "Show 'Share' button in the main menu",
			type: "boolean",
			defaultValue: true,
			onChange: (value) => {
				if (value) {
					// show the button
					shareButton.style.display = "inline-block";
				} else {
					// hide the button
					shareButton.style.display = "none";
				}
			}
		});

		menu.append(shareButton);
	},

	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		const onDrawForeground = nodeType.prototype.onDrawForeground;
		nodeType.prototype.onDrawForeground = function (ctx) {
			const r = onDrawForeground?.apply?.(this, arguments);

			if (!this.flags.collapsed && badge_mode != 'none' && nodeType.title_mode != LiteGraph.NO_TITLE) {
				let text = "";
				if (badge_mode == 'id_nick')
					text = `#${this.id} `;

				if (nicknames[nodeData.name.trim()]) {
					let nick = nicknames[nodeData.name.trim()];

					if (nick.length > 25) {
						text += nick.substring(0, 23) + "..";
					}
					else {
						text += nick;
					}
				}

				if (text != "") {
					let fgColor = "white";
					let bgColor = "#0F1F0F";
					let visible = true;

					ctx.save();
					ctx.font = "12px sans-serif";
					const sz = ctx.measureText(text);
					ctx.fillStyle = bgColor;
					ctx.beginPath();
					ctx.roundRect(this.size[0] - sz.width - 12, -LiteGraph.NODE_TITLE_HEIGHT - 20, sz.width + 12, 20, 5);
					ctx.fill();

					ctx.fillStyle = fgColor;
					ctx.fillText(text, this.size[0] - sz.width - 6, -LiteGraph.NODE_TITLE_HEIGHT - 6);
					ctx.restore();
				}
			}
			return r;
		};
	},

	async loadedGraphNode(node, app) {
		if (node.has_errors) {
			const onDrawForeground = node.onDrawForeground;
			node.onDrawForeground = function (ctx) {
				const r = onDrawForeground?.apply?.(this, arguments);

				if (!this.flags.collapsed && badge_mode != 'none') {
					let text = "";
					if (badge_mode == 'id_nick')
						text = `#${this.id} `;

					if (nicknames[node.type.trim()]) {
						let nick = nicknames[node.type.trim()];

						if (nick.length > 25) {
							text += nick.substring(0, 23) + "..";
						}
						else {
							text += nick;
						}
					}

					if (text != "") {
						let fgColor = "white";
						let bgColor = "#0F1F0F";
						let visible = true;

						ctx.save();
						ctx.font = "12px sans-serif";
						const sz = ctx.measureText(text);
						ctx.fillStyle = bgColor;
						ctx.beginPath();
						ctx.roundRect(this.size[0] - sz.width - 12, -LiteGraph.NODE_TITLE_HEIGHT - 20, sz.width + 12, 20, 5);
						ctx.fill();

						ctx.fillStyle = fgColor;
						ctx.fillText(text, this.size[0] - sz.width - 6, -LiteGraph.NODE_TITLE_HEIGHT - 6);
						ctx.restore();

						ctx.save();
						ctx.font = "bold 14px sans-serif";
						const sz2 = ctx.measureText(node.type);
						ctx.fillStyle = 'white';
						ctx.fillText(node.type, this.size[0] / 2 - sz2.width / 2, this.size[1] / 2);
						ctx.restore();
					}
				}

				return r;
			};
		}
	}
});