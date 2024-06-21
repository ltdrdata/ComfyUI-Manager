import { $el } from "../../scripts/ui.js";
import { 
	manager_instance, rebootAPI, 
	fetchData, md5, icons 
} from  "./common.js";

// https://cenfun.github.io/turbogrid/api.html
import TG from "./turbogrid.esm.js";

const pageCss = `
.cmm-manager {
	--grid-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
	z-index: 10001;
	width: 80%;
	height: 80%;
	display: flex;
	flex-direction: column;
	gap: 10px;
	color: var(--fg-color);
	font-family: arial, sans-serif;
}

.cmm-manager .cn-flex-auto {
	flex: auto;
}

.cmm-manager button {
	font-size: 16px;
	color: var(--input-text);
    background-color: var(--comfy-input-bg);
    border-radius: 8px;
    border-color: var(--border-color);
    border-style: solid;
    margin: 0;
	padding: 4px 8px;
	min-width: 100px;
}

.cmm-manager button:disabled,
.cmm-manager input:disabled,
.cmm-manager select:disabled {
	color: gray;
}

.cmm-manager button:disabled {
	background-color: var(--comfy-input-bg);
}

.cmm-manager .cmm-manager-restart {
	display: none;
	background-color: #500000;
	color: white;
}

.cmm-manager-header {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	align-items: center;
	padding: 0 5px;
}

.cmm-manager-header label {
	display: flex;
	gap: 5px;
	align-items: center;
}

.cmm-manager-filter {
	height: 28px;
	line-height: 28px;
}

.cmm-manager-keywords {
	height: 28px;
	line-height: 28px;
	padding: 0 5px 0 26px;
	background-size: 16px;
	background-position: 5px center;
	background-repeat: no-repeat;
	background-image: url("data:image/svg+xml;charset=utf8,${encodeURIComponent(icons.search.replace("currentColor", "#888"))}");
}

.cmm-manager-status {
	padding-left: 10px;
}

.cmm-manager-grid {
	flex: auto;
	border: 1px solid var(--border-color);
	overflow: hidden;
}

.cmm-manager-message {
	
}

.cmm-manager-footer {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	align-items: center;
}

.cmm-manager-grid .tg-turbogrid {
	font-family: var(--grid-font);
	font-size: 15px;
	background: var(--bg-color);
}

.cmm-manager-grid .cn-node-name a {
	color: skyblue;
	text-decoration: none;
	word-break: break-word;
}

.cmm-manager-grid .cn-node-desc a {
	color: #5555FF;
    font-weight: bold;
	text-decoration: none;
}

.cmm-manager-grid .tg-cell a:hover {
	text-decoration: underline;
}

.cmm-manager-grid .cn-extensions-button,
.cmm-manager-grid .cn-conflicts-button {
	display: inline-block;
	width: 20px;
	height: 20px;
	color: green;
	border: none;
	padding: 0;
	margin: 0;
	background: none;
	min-width: 20px;
}

.cmm-manager-grid .cn-conflicts-button {
	color: orange;
}

.cmm-manager-grid .cn-extensions-list,
.cmm-manager-grid .cn-conflicts-list {
	line-height: normal;
	text-align: left;
	max-height: 80%;
	min-height: 200px;
	min-width: 300px;
	overflow-y: auto;
	font-size: 12px;
	border-radius: 5px;
	padding: 10px;
	filter: drop-shadow(2px 5px 5px rgb(0 0 0 / 30%));
}

.cmm-manager-grid .cn-extensions-list {
	border-color: var(--bg-color);
}

.cmm-manager-grid .cn-conflicts-list {
	background-color: #CCCC55;
	color: #AA3333;
}

.cmm-manager-grid .cn-extensions-list h3,
.cmm-manager-grid .cn-conflicts-list h3 {
	margin: 0;
	padding: 5px 0;
	color: #000;
}

.cn-tag-list {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	align-items: center;
	margin-bottom: 5px;
}

.cn-tag-list > div {
	background-color: var(--border-color);
	border-radius: 5px;
    padding: 0 5px;
}

.cn-install-buttons {
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding: 3px;
	align-items: center;
    justify-content: center;
    height: 100%;
}

.cn-selected-buttons {
	display: flex;
	gap: 5px;
	align-items: center;
	padding-right: 20px;
}

.cmm-manager .cn-btn-enable {
	background-color: blue;
	color: white;
}

.cmm-manager .cn-btn-disable {
	background-color: MediumSlateBlue;
	color: white;
}

.cmm-manager .cn-btn-update {
	background-color: blue;
	color: white;
}

.cmm-manager .cn-btn-try-update {
	background-color: Gray;
	color: white;
}

.cmm-manager .cn-btn-try-fix {
	background-color: #6495ED;
	color: white;
}

.cmm-manager .cn-btn-install {
	background-color: black;
	color: white;
}

.cmm-manager .cn-btn-try-install {
	background-color: Gray;
	color: white;
}

.cmm-manager .cn-btn-uninstall {
	background-color: red;
	color: white;
}

@keyframes cn-btn-loading-bg {
    0% {
        left: 0;
    }
    100% {
        left: -100px;
    }
}

.cmm-manager button.cn-btn-loading {
    position: relative;
    overflow: hidden;
    border-color: rgb(0 119 207 / 80%);
	background-color: var(--comfy-input-bg);
}

.cmm-manager button.cn-btn-loading::after {
    position: absolute;
    top: 0;
    left: 0;
    content: "";
    width: 500px;
    height: 100%;
    background-image: repeating-linear-gradient(
        -45deg,
        rgb(0 119 207 / 30%),
        rgb(0 119 207 / 30%) 10px,
        transparent 10px,
        transparent 15px
    );
    animation: cn-btn-loading-bg 3s linear infinite;
}

.cmm-manager-light .cn-node-name a {
	color: blue;
}

.cmm-manager-light .cm-warn-note {
	background-color: #ccc !important;
}

.cmm-manager-light .cn-btn-install {
	background-color: #333;
}

`;

const pageHtml = `
<div class="cmm-manager-header">
	<label>Filter
		<select class="cmm-manager-filter"></select>
	</label>
	<label>Type
		<select class="cmm-manager-type"></select>
	</label>
	<label>Base
		<select class="cmm-manager-base"></select>
	</label>
	<input class="cmm-manager-keywords" type="search" placeholder="Search" />
	<div class="cmm-manager-status"></div>
	<div class="cn-flex-auto"></div>
</div>
<div class="cmm-manager-grid"></div>
<div class="cmm-manager-message"></div>
<div class="cmm-manager-footer">
	<button class="cmm-manager-close">Close</button>
	<button class="cmm-manager-restart">Restart</button>
	<div class="cn-flex-auto"></div>
</div>
`;

export class ModelManager {
	static instance = null;

	constructor(app, manager_dialog) {
		this.app = app;
		this.manager_dialog = manager_dialog;
		this.id = "cmm-manager";

		this.filter = '';
		this.type = '';
		this.base = '';
		this.keywords = '';
		this.restartMap = {};

		this.init();
	}

	init() {

		if (!document.querySelector(`style[context="${this.id}"]`)) {
			const $style = document.createElement("style");
			$style.setAttribute("context", this.id);
			$style.innerHTML = pageCss;
			document.head.appendChild($style);
		}

		this.element = $el("div", {
			parent: document.body,
			className: "comfy-modal cmm-manager"
		});
		this.element.innerHTML = pageHtml;
		this.initFilter();
		this.bindEvents();
		this.initGrid();
	}

	initFilter() {
		
		this.filterList = [{
			label: "All",
			value: ""
		}, {
			label: "Installed",
			value: "True"
		}, {
			label: "Not Installed",
			value: "False"
		}, {
			label: "Unknown",
			value: "None"
		}];

		this.typeList = [{
			label: "All",
			value: ""
		}];

		this.baseList = [{
			label: "All",
			value: ""
		}];

		this.updateFilter();
		
	}

	updateFilter() {
		const $filter  = this.element.querySelector(".cmm-manager-filter");
		$filter.innerHTML = this.filterList.map(item => {
			return `<option value="${item.value}">${item.label}</option>`
		}).join("");

		const $type  = this.element.querySelector(".cmm-manager-type");
		$type.innerHTML = this.typeList.map(item => {
			return `<option value="${item.value}">${item.label}</option>`
		}).join("");

		const $base  = this.element.querySelector(".cmm-manager-base");
		$base.innerHTML = this.baseList.map(item => {
			return `<option value="${item.value}">${item.label}</option>`
		}).join("");

	}

	getFilterItem(filter) {
		return this.filterList.find(it => it.value === filter)
	}

	getInstallButtons(installed, title) {

		const buttons = {
			"install": {
				label: "Install",
				mode: "install"
			},
			"try-install": {
				label: "Try install",
				mode: "install"
			}
		}

		const installGroups = {
			"False": ["install"],
			'None': ["try-install"]
		}

		const list = installGroups[installed];
		if (!list) {
			return "";
		}

		return list.map(id => {
			const bt = buttons[id];
			return `<button class="cn-btn-${id}" group="${installed}" mode="${bt.mode}">${bt.label}</button>`;
		}).join("");
	}

	getButton(target) {
		if(!target) {
			return;
		}
		const mode = target.getAttribute("mode");
		if (!mode) {
			return;
		}
		const group = target.getAttribute("group");
		if (!group) {
			return;
		}
		return {
			group,
			mode,
			target,
			label: target.innerText
		}
	}

	bindEvents() {
		const eventsMap = {
			".cmm-manager-filter": {
				change: (e) => {
					this.updateGrid();
				}
			},
			".cmm-manager-type": {
				change: (e) => {
					this.updateGrid();
				}
			},
			".cmm-manager-base": {
				change: (e) => {
					this.updateGrid();
				}
			},

			".cmm-manager-keywords": {
				input: (e) => {
					const keywords = `${e.target.value}`.trim();
					if (keywords !== this.keywords) {
						this.keywords = keywords;
						this.updateGrid();
					}
				},
				focus: (e) => e.target.select()
			},

			".cmm-manager-close": {
				click: (e) => this.close()
			},

			".cmm-manager-restart": {
				click: () => {
					if(rebootAPI()) {
						this.close();
						this.manager_dialog.close();
					}
				}
			}
		};
		Object.keys(eventsMap).forEach(selector => {
			const target = this.element.querySelector(selector);
			if (target) {
				const events = eventsMap[selector];
				if (events) {
					Object.keys(events).forEach(type => {
						target.addEventListener(type, events[type]);
					});
				}
			}
		});
	}

	// ===========================================================================================

	initGrid() {
		const container = this.element.querySelector(".cmm-manager-grid");
		const grid = new TG.Grid(container);
		this.grid = grid;
		
		let prevViewRowsLength = -1;
		grid.bind('onUpdated', (e, d) => {

			const viewRows = grid.viewRows;
			if (viewRows.length !== prevViewRowsLength) {
				prevViewRowsLength = viewRows.length;
				this.showStatus(`${prevViewRowsLength.toLocaleString()} external models`);
			}

        });

		grid.bind('onClick', (e, d) => {
			const btn = this.getButton(d.e.target);
			if (btn) {
				this.installNodes([d.rowItem.hash], btn, d.rowItem.title);
			}
        });

		grid.setOption({
			theme: 'dark',

			textSelectable: true,
			scrollbarRound: true,

			frozenColumn: 1,
			rowNotFound: "No Results",

			rowHeight: 40,
			bindWindowResize: true,
			bindContainerResize: true,

			cellResizeObserver: (rowItem, columnItem) => {
				const autoHeightColumns = ['name', 'installed', 'description'];
				return autoHeightColumns.includes(columnItem.id)
			},

			// updateGrid handler for filter and keywords
			rowFilter: (rowItem) => {

				const searchableColumns = ["name", "type", "base", "description", "filename", "save_path"];

				let shouldShown = grid.highlightKeywordsFilter(rowItem, searchableColumns, this.keywords);

				if (shouldShown) {
					if(this.filter && rowItem.filterTypes) {
						shouldShown = rowItem.filterTypes.includes(this.filter);
					}
				}

				return shouldShown;
			}
		});

	}

	renderGrid() {

		// update theme
		const colorPalette = this.app.ui.settings.settingsValues['Comfy.ColorPalette'];
		Array.from(this.element.classList).forEach(cn => {
			if (cn.startsWith("cmm-manager-")) {
				this.element.classList.remove(cn);
			}
		});
		this.element.classList.add(`cmm-manager-${colorPalette}`);

		const options = {
			theme: colorPalette === "light" ? "" : "dark"
		};

		const rows = this.modelList || [];

		const columns = [{
			id: 'id',
			name: 'ID',
			width: 50,
			align: 'center'
		}, {
			id: 'name',
			name: 'Name',
			width: 200,
			minWidth: 100,
			maxWidth: 500,
			classMap: 'cn-node-name',
			formatter: function(name, rowItem, columnItem, cellNode) {
				return `<a href=${rowItem.reference} target="_blank"><b>${name}</b></a>`;
			}
		}, {
			id: 'installed',
			name: 'Install',
			width: 130,
			minWidth: 110,
			maxWidth: 200,
			sortable: false,
			align: 'center',
			formatter: (installed, rowItem, columnItem) => {
				if (rowItem.restart) {
					return `<font color="red">Restart Required</span>`;
				}
				const buttons = this.getInstallButtons(installed, rowItem.title);
				return `<div class="cn-install-buttons">${buttons}</div>`;
			}
		}, {
			id: 'type',
			name: 'Type',
			width: 100
		}, {
			id: 'base',
			name: 'Base'
		}, {
			id: 'description',
			name: 'Description',
			width: 400,
			maxWidth: 5000,
			classMap: 'cn-node-desc'
		}, {
			id: 'filename',
			name: 'Filename',
			width: 150
		}, {
			id: "save_path",
			name: 'Save Path'
		}];

		this.grid.setData({
			options,
			rows,
			columns
		});

		this.grid.render();
		
	}

	updateGrid() {
		if (this.grid) {
			this.grid.update();
		}
	}

	// ===========================================================================================

	focusInstall(item, mode) {
		const cellNode = this.grid.getCellNode(item, "installed");
		if (cellNode) {
			const cellBtn = cellNode.querySelector(`button[mode="${mode}"]`);
			if (cellBtn) {
				cellBtn.classList.add("cn-btn-loading");
				return true
			}
		}
	}

	async installNodes(list, btn, title) {
		
		const { target, label, mode} = btn;

		if(mode === "uninstall") {
			title = title || `${list.length} custom nodes`;
			if (!confirm(`Are you sure uninstall ${title}?`)) {
				return;
			}
		}

		target.classList.add("cn-btn-loading");
		this.showLoading();
		this.showError("");

		let needRestart = false;
		let errorMsg = "";
		for (const hash of list) {

			const item = this.grid.getRowItemBy("hash", hash);
			if (!item) {
				errorMsg = `Not found custom node: ${hash}`;
				break;
			}

			this.grid.scrollRowIntoView(item);

			if (!this.focusInstall(item, mode)) {
				this.grid.onNextUpdated(() => {
					this.focusInstall(item, mode);
				});
			}

			this.showStatus(`${label} ${item.title} ...`);

			const data = item.originalData;
			const res = await fetchData(`/customnode/${mode}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (res.error) {

				errorMsg = `${item.title} ${mode} failed: `;
				if(res.status == 403) {
					errorMsg += `This action is not allowed with this security level configuration.`;
				} else if(res.status == 404) {
					errorMsg += `With the current security level configuration, only custom nodes from the <B>"default channel"</B> can be installed.`;
				} else {
					errorMsg += res.error.message;
				}

				break;
			}

			needRestart = true;

			this.grid.setRowSelected(item, false);
			item.restart = true;
			this.restartMap[item.hash] = true;
			this.grid.updateCell(item, "installed");

			//console.log(res.data);

		}

		this.hideLoading();
		target.classList.remove("cn-btn-loading");

		if (errorMsg) {
			this.showError(errorMsg);
		} else {
			this.showStatus(`${label} ${list.length} custom node(s) successfully`);
		}

		if (needRestart) {
			this.showRestart();
			this.showMessage(`To apply the installed/updated/disabled/enabled custom node, please restart ComfyUI. And refresh browser.`, "red")
		}

	}

	getModelList(models) {

		const typeMap = new Map();
		const baseMap = new Map();


		models.forEach((item, i) => {
			const { type, base, name, reference } = item;
			item.hash = md5(name + reference);
			item.id = i + 1;

			baseMap.set(type, type);
			typeMap.set(base, base);
		});

		this.typeList = [{
			label: "All",
			value: ""
		}];
		this.baseList = [{
			label: "All",
			value: ""
		}];

		typeMap.forEach(type => {
			this.typeList.push({
				label: type,
				value: type
			});
		});
		baseMap.forEach(base => {
			this.baseList.push({
				label: base,
				value: base
			});
		});

		return models;
	}

	// ===========================================================================================

	async loadData() {

		this.showLoading();

		this.showStatus(`Loading data ...`);

		const mode = manager_instance.datasrc_combo.value;

		const res = await fetchData(`/externalmodel/getlist?mode=${mode}`);
		if (res.error) {
			this.showError("Failed to get external model list.");
			this.hideLoading();
			return
		}
		
		const { models } = res.data;

		this.modelList = this.getModelList(models);

		this.updateFilter();
		
		this.renderGrid();

		this.hideLoading();
		
	}

	// ===========================================================================================

	showError(err) {
		this.showMessage(err, "red");
	}

	showMessage(msg, color) {
		if (color) {
			msg = `<font color="${color}">${msg}</font>`;
		}
		this.element.querySelector(".cmm-manager-message").innerHTML = msg;
	}

	showStatus(msg, color) {
		if (color) {
			msg = `<font color="${color}">${msg}</font>`;
		}
		this.element.querySelector(".cmm-manager-status").innerHTML = msg;
	}

	showLoading() {
		this.setDisabled(true);
		if (this.grid) {
			this.grid.showLoading();
			this.grid.showMask({
				opacity: 0.05
			});
		}
	}

	hideLoading() {
		this.setDisabled(false);
		if (this.grid) {
			this.grid.hideLoading();
			this.grid.hideMask();
		}
	}

	setDisabled(disabled) {

		const $close = this.element.querySelector(".cmm-manager-close");
		const $restart = this.element.querySelector(".cmm-manager-restart");

		const list = [
			".cmm-manager-header input",
			".cmm-manager-header select",
			".cmm-manager-footer button"
		].map(s => {
			return Array.from(this.element.querySelectorAll(s));
		})
		.flat()
		.filter(it => {
			return it !== $close && it !== $restart;
		});
		
		list.forEach($elem => {
			if (disabled) {
				$elem.setAttribute("disabled", "disabled");
			} else {
				$elem.removeAttribute("disabled");
			}
		});

		Array.from(this.element.querySelectorAll(".cn-btn-loading")).forEach($elem => {
			$elem.classList.remove("cn-btn-loading");
		});

	}

	showRestart() {
		this.element.querySelector(".cmm-manager-restart").style.display = "block";
	}

	setFilter(filterValue) {
		let filter = "";
		const filterItem = this.getFilterItem(filterValue);
		if(filterItem) {
			filter = filterItem.value;
		}
		this.filter = filter;
		this.element.querySelector(".cmm-manager-filter").value = filter;
	}

	setKeywords(keywords = "") {
		this.keywords = keywords;
		this.element.querySelector(".cmm-manager-keywords").value = keywords;
	}

	show() {
		this.element.style.display = "flex";
		this.setKeywords("");
		this.showMessage("");
		this.loadData();
	}

	close() {
		this.element.style.display = "none";
	}
}