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

.cmm-manager .cmm-flex-auto {
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

.cmm-manager-type,
.cmm-manager-base,
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

.cmm-manager-grid .cmm-node-name a {
	color: skyblue;
	text-decoration: none;
	word-break: break-word;
}

.cmm-manager-grid .cmm-node-desc a {
	color: #5555FF;
    font-weight: bold;
	text-decoration: none;
}

.cmm-manager-grid .tg-cell a:hover {
	text-decoration: underline;
}

.cmm-icon-passed {
	width: 20px;
	height: 20px;
	position: absolute;
	left: calc(50% - 10px);
	top: calc(50% - 10px);

}

.cmm-manager .cmm-btn-enable {
	background-color: blue;
	color: white;
}

.cmm-manager .cmm-btn-disable {
	background-color: MediumSlateBlue;
	color: white;
}

.cmm-manager .cmm-btn-install {
	background-color: black;
	color: white;
}

@keyframes cmm-btn-loading-bg {
    0% {
        left: 0;
    }
    100% {
        left: -100px;
    }
}

.cmm-manager button.cmm-btn-loading {
    position: relative;
    overflow: hidden;
    border-color: rgb(0 119 207 / 80%);
	background-color: var(--comfy-input-bg);
}

.cmm-manager button.cmm-btn-loading::after {
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
    animation: cmm-btn-loading-bg 3s linear infinite;
}

.cmm-manager-light .cmm-node-name a {
	color: blue;
}

.cmm-manager-light .cm-warn-note {
	background-color: #ccc !important;
}

.cmm-manager-light .cmm-btn-install {
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
	<div class="cmm-flex-auto"></div>
</div>
<div class="cmm-manager-grid"></div>
<div class="cmm-manager-message"></div>
<div class="cmm-manager-footer">
	<button class="cmm-manager-close">Close</button>
	<div class="cmm-flex-auto"></div>
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
			const selected = item.value === this.filter ? " selected" : "";
			return `<option value="${item.value}"${selected}>${item.label}</option>`
		}).join("");

		const $type  = this.element.querySelector(".cmm-manager-type");
		$type.innerHTML = this.typeList.map(item => {
			const selected = item.value === this.type ? " selected" : "";
			return `<option value="${item.value}"${selected}>${item.label}</option>`
		}).join("");

		const $base  = this.element.querySelector(".cmm-manager-base");
		$base.innerHTML = this.baseList.map(item => {
			const selected = item.value === this.base ? " selected" : "";
			return `<option value="${item.value}"${selected}>${item.label}</option>`
		}).join("");

	}

	bindEvents() {
		const eventsMap = {
			".cmm-manager-filter": {
				change: (e) => {
					this.filter = e.target.value;
					this.updateGrid();
				}
			},
			".cmm-manager-type": {
				change: (e) => {
					this.type = e.target.value;
					this.updateGrid();
				}
			},
			".cmm-manager-base": {
				change: (e) => {
					this.base = e.target.value;
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
		
		grid.bind('onUpdated', (e, d) => {

			this.showStatus(`${grid.viewRows.length.toLocaleString()} external models`);

        });

		grid.bind('onClick', (e, d) => {
			const { rowItem } = d;
			const target = d.e.target;
			const mode = target.getAttribute("mode");
			if (mode === "install") {
				this.installModel(rowItem, target);
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
				const autoHeightColumns = ['name', 'description'];
				return autoHeightColumns.includes(columnItem.id)
			},

			// updateGrid handler for filter and keywords
			rowFilter: (rowItem) => {

				const searchableColumns = ["name", "type", "base", "description", "filename", "save_path"];

				let shouldShown = grid.highlightKeywordsFilter(rowItem, searchableColumns, this.keywords);

				if (shouldShown) {
					if(this.filter && rowItem.installed !== this.filter) {
						return false;
					}

					if(this.type && rowItem.type !== this.type) {
						return false;
					}

					if(this.base && rowItem.base !== this.base) {
						return false;
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
			classMap: 'cmm-node-name',
			formatter: function(name, rowItem, columnItem, cellNode) {
				return `<a href=${rowItem.reference} target="_blank"><b>${name}</b></a>`;
			}
		}, {
			id: 'installed',
			name: 'Download',
			width: 130,
			minWidth: 110,
			maxWidth: 200,
			sortable: false,
			align: 'center',
			formatter: (installed, rowItem, columnItem) => {
				if (rowItem.refresh) {
					return `<font color="red">Refresh Required</span>`;
				}
				if (installed === "True") {
					return `<div class="cmm-icon-passed">${icons.passed}</div>`;
				}
				return `<button class="cmm-btn-install" mode="install">Install</button>`;
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
			classMap: 'cmm-node-desc'
		}, {
			id: 'filename',
			name: 'Filename',
			width: 200
		}, {
			id: "save_path",
			name: 'Save Path',
			width: 200
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

	async installModel(item, btn) {
		
		this.showLoading();
		this.showError("");

		this.showStatus(`Install ${item.name} ...`);
		btn.classList.add("cmm-btn-loading");

		const data = item.originalData;
		const res = await fetchData('/model/install', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});


		if (res.error) {
			const errorMsg = `Install failed: ${item.name} ${res.error.message}`;
			this.showError(errorMsg);
			this.hideLoading();
			return;
		}

		item.refresh = true;
		this.grid.updateCell(item, "installed");

		this.hideLoading();

		this.showStatus(`Install ${item.name} successfully`);
		this.showMessage(`To apply the installed model, please click the 'Refresh' button on the main menu.`, "red")

	}

	getModelList(models) {

		const typeMap = new Map();
		const baseMap = new Map();

		models.forEach((item, i) => {
			const { type, base, name, reference } = item;
			item.originalData = JSON.parse(JSON.stringify(item));
			item.hash = md5(name + reference);
			item.id = i + 1;

			typeMap.set(type, type);
			baseMap.set(base, base);

		});

		const typeList = [];
		typeMap.forEach(type => {
			typeList.push({
				label: type,
				value: type
			});
		});
		typeList.sort((a,b)=> {
			const au = a.label.toUpperCase();
        	const bu = b.label.toUpperCase();
        	if (au !== bu) {
            	return au > bu ? 1 : -1;
			}
			return 0;
		});
		this.typeList = [{
			label: "All",
			value: ""
		}].concat(typeList);


		const baseList = [];
		baseMap.forEach(base => {
			baseList.push({
				label: base,
				value: base
			});
		});
		baseList.sort((a,b)=> {
			const au = a.label.toUpperCase();
        	const bu = b.label.toUpperCase();
        	if (au !== bu) {
            	return au > bu ? 1 : -1;
			}
			return 0;
		});
		this.baseList = [{
			label: "All",
			value: ""
		}].concat(baseList);

		return models;
	}

	// ===========================================================================================

	async loadData() {

		this.showLoading();

		this.showStatus(`Loading external model list ...`);

		const mode = manager_instance.datasrc_combo.value;

		const res = await fetchData(`/externalmodel/getlist?mode=${mode}`);
		if (res.error) {
			this.showError("Failed to get external model list.");
			this.hideLoading();
			return
		}
		
		const { models } = res.data;

		this.modelList = this.getModelList(models);
		// console.log("models", this.modelList);

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

		const list = [
			".cmm-manager-header input",
			".cmm-manager-header select",
			".cmm-manager-footer button"
		].map(s => {
			return Array.from(this.element.querySelectorAll(s));
		})
		.flat()
		.filter(it => {
			return it !== $close;
		});
		
		list.forEach($elem => {
			if (disabled) {
				$elem.setAttribute("disabled", "disabled");
			} else {
				$elem.removeAttribute("disabled");
			}
		});

		Array.from(this.element.querySelectorAll(".cmm-btn-loading")).forEach($elem => {
			$elem.classList.remove("cmm-btn-loading");
		});

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