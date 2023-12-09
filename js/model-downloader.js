import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"
import { ComfyDialog, $el } from "../../scripts/ui.js";
import { install_checked_custom_node, manager_instance, rebootAPI } from  "./common.js";

async function install_model(target) {
	if(ModelInstaller.instance) {
		ModelInstaller.instance.startInstall(target);

		try {
			const response = await api.fetchApi('/model/install', {
													method: 'POST',
													headers: { 'Content-Type': 'application/json' },
													body: JSON.stringify(target)
												});

			const status = await response.json();
			app.ui.dialog.close();
			target.installed = 'True';
			return true;
		}
		catch(exception) {
			app.ui.dialog.show(`Install failed: ${target.title} / ${exception}`);
			app.ui.dialog.element.style.zIndex = 10010;
			return false;
		}
		finally {
			await ModelInstaller.instance.invalidateControl();
			ModelInstaller.instance.updateMessage("<BR>To apply the installed model, please click the 'Refresh' button on the main menu.");
		}
	}
}

async function getModelList() {
	var mode = manager_instance.datasrc_combo.value;

	const response = await api.fetchApi(`/externalmodel/getlist?mode=${mode}`);

	const data = await response.json();
	return data;
}

export class ModelInstaller extends ComfyDialog {
	static instance = null;

	install_buttons = [];
	message_box = null;
	data = null;

	clear() {
		this.install_buttons = [];
		this.message_box = null;
		this.data = null;
	}

	constructor(app, manager_dialog) {
		super();
		this.manager_dialog = manager_dialog;
		this.search_keyword = '';
		this.element = $el("div.comfy-modal", { parent: document.body }, []);
	}

	createControls() {
		return [
			$el("button.cm-small-button", {
				type: "button",
				textContent: "Close",
				onclick: () => { this.close(); }
				})
		];
	}

	startInstall(target) {
		const self = ModelInstaller.instance;

		self.updateMessage(`<BR><font color="green">Installing '${target.name}'</font>`);

		for(let i in self.install_buttons) {
			self.install_buttons[i].disabled = true;
			self.install_buttons[i].style.backgroundColor = 'gray';
		}
	}

	apply_searchbox(data) {
		let keyword = this.search_box.value.toLowerCase();
		for(let i in this.grid_rows) {
			let data = this.grid_rows[i].data;
			let content = data.name.toLowerCase() + data.type.toLowerCase() + data.base.toLowerCase() + data.description.toLowerCase();

			if(this.filter && this.filter != '*') {
				if(this.filter != data.installed) {
					this.grid_rows[i].control.style.display = 'none';
					continue;
				}
			}

			if(keyword == "")
				this.grid_rows[i].control.style.display = null;
			else if(content.includes(keyword)) {
				this.grid_rows[i].control.style.display = null;
			}
			else {
				this.grid_rows[i].control.style.display = 'none';
			}
		}
	}

	async invalidateControl() {
		this.clear();
		this.data = (await getModelList()).models;

		while (this.element.children.length) {
			this.element.removeChild(this.element.children[0]);
		}

		await this.createHeaderControls();

		if(this.search_keyword) {
			this.search_box.value = this.search_keyword;
		}

		await this.createGrid();
		await this.createBottomControls();

		this.apply_searchbox(this.data);
	}

	updateMessage(msg, btn_id) {
		this.message_box.innerHTML = msg;
		if(btn_id) {
			const rebootButton = document.getElementById(btn_id);
			const self = this;
			rebootButton.addEventListener("click",
				function() {
					if(rebootAPI()) {
						self.close();
						self.manager_dialog.close();
					}
				});
		}
	}

	async createGrid(models_json) {
		var grid = document.createElement('table');
		grid.setAttribute('id', 'external-models-grid');

        var thead = document.createElement('thead');
        var tbody = document.createElement('tbody');

		var headerRow = document.createElement('tr');
		thead.style.position = "sticky";
		thead.style.top = "0px";
        thead.style.borderCollapse = "collapse";
        thead.style.tableLayout = "fixed";

		var header1 = document.createElement('th');
		header1.innerHTML = '&nbsp;&nbsp;ID&nbsp;&nbsp;';
		header1.style.width = "20px";
		var header2 = document.createElement('th');
		header2.innerHTML = 'Type';
		header2.style.width = "100px";
		var header3 = document.createElement('th');
		header3.innerHTML = 'Base';
		header3.style.width = "100px";
		var header4 = document.createElement('th');
		header4.innerHTML = 'Name';
		header4.style.width = "30%";
		var header5 = document.createElement('th');
		header5.innerHTML = 'Filename';
		header5.style.width = "20%";
		header5.style.tableLayout = "fixed";
		var header6 = document.createElement('th');
		header6.innerHTML = 'Description';
		header6.style.width = "50%";
		var header_down = document.createElement('th');
		header_down.innerHTML = 'Download';
		header_down.style.width = "50px";

        thead.appendChild(headerRow);
		headerRow.appendChild(header1);
		headerRow.appendChild(header2);
		headerRow.appendChild(header3);
		headerRow.appendChild(header4);
		headerRow.appendChild(header5);
		headerRow.appendChild(header6);
		headerRow.appendChild(header_down);

		headerRow.style.backgroundColor = "Black";
		headerRow.style.color = "White";
		headerRow.style.textAlign = "center";
		headerRow.style.width = "100%";
		headerRow.style.padding = "0";

		grid.appendChild(thead);
		grid.appendChild(tbody);

		this.grid_rows = {};

		if(this.data)
			for (var i = 0; i < this.data.length; i++) {
				const data = this.data[i];
				var dataRow = document.createElement('tr');
				var data1 = document.createElement('td');
				data1.style.textAlign = "center";
				data1.innerHTML = i+1;
				var data2 = document.createElement('td');
				data2.innerHTML = `&nbsp;${data.type}`;
				var data3 = document.createElement('td');
				data3.innerHTML = `&nbsp;${data.base}`;
				var data4 = document.createElement('td');
				data4.className = "cm-node-name";
				data4.innerHTML = `&nbsp;<a href=${data.reference} target="_blank"><font color="skyblue"><b>${data.name}</b></font></a>`;
				var data5 = document.createElement('td');
				data5.className = "cm-node-filename";
				data5.innerHTML = `&nbsp;${data.filename}`;
				data5.style.wordBreak = "break-all";
				var data6 = document.createElement('td');
				data6.className = "cm-node-desc";
				data6.innerHTML = data.description;
				data6.style.wordBreak = "break-all";
				var data_install = document.createElement('td');
				var installBtn = document.createElement('button');
				data_install.style.textAlign = "center";

				installBtn.innerHTML = 'Install';
				this.install_buttons.push(installBtn);

				switch(data.installed) {
				case 'True':
					installBtn.innerHTML = 'Installed';
					installBtn.style.backgroundColor = 'green';
					installBtn.style.color = 'white';
					installBtn.disabled = true;
					break;
				default:
					installBtn.innerHTML = 'Install';
					installBtn.style.backgroundColor = 'black';
					installBtn.style.color = 'white';
					break;
				}

				installBtn.style.width = "100px";

				installBtn.addEventListener('click', function() {
					install_model(data);
				});

				data_install.appendChild(installBtn);

				dataRow.style.backgroundColor = "var(--bg-color)";
				dataRow.style.color = "var(--fg-color)";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				dataRow.appendChild(data6);
				dataRow.appendChild(data_install);
				tbody.appendChild(dataRow);

				this.grid_rows[i] = {data:data, control:dataRow};
			}

        let self = this;
		const panel = document.createElement('div');
        panel.style.width = "100%";
		panel.appendChild(grid);

        function handleResize() {
          const parentHeight = self.element.clientHeight;
          const gridHeight = parentHeight - 200;

          grid.style.height = gridHeight + "px";
        }
		window.addEventListener("resize", handleResize);

		grid.style.position = "relative";
		grid.style.display = "inline-block";
		grid.style.width = "100%";
		grid.style.height = "100%";
		grid.style.overflowY = "scroll";
		this.element.style.height = "85%";
		this.element.style.width = "80%";
		this.element.appendChild(panel);

        handleResize();
	}

	createFilterCombo() {
		let combo = document.createElement("select");

		combo.style.cssFloat = "left";
		combo.style.fontSize = "14px";
		combo.style.padding = "4px";
		combo.style.background = "black";
		combo.style.marginLeft = "2px";
		combo.style.width = "199px";
		combo.id = `combo-manger-filter`;
		combo.style.borderRadius = "15px";

		let items =
			[
				{ value:'*', text:'Filter: all' },
				{ value:'True', text:'Filter: installed' },
				{ value:'False', text:'Filter: not-installed' },
			];

		items.forEach(item => {
			const option = document.createElement("option");
			option.value = item.value;
			option.text = item.text;
			combo.appendChild(option);
		});

		let self = this;
		combo.addEventListener('change', function(event) {
			self.filter = event.target.value;
			self.apply_searchbox();
		});

		return combo;
	}

	createHeaderControls() {
		let self = this;
		this.search_box = $el('input.cm-search-filter', {type:'text', id:'manager-model-search-box', placeholder:'input search keyword', value:this.search_keyword}, []);
		this.search_box.style.height = "25px";
		this.search_box.onkeydown = (event) => {
				if (event.key === 'Enter') {
					self.search_keyword = self.search_box.value;
					self.apply_searchbox();
				}
				if (event.key === 'Escape') {
					self.search_keyword = self.search_box.value;
					self.apply_searchbox();
				}
			};

		let search_button = document.createElement("button");
		search_button.className = "cm-small-button";
		search_button.innerHTML = "Search";
		search_button.onclick = () => {
			self.search_keyword = self.search_box.value;
			self.apply_searchbox();
		};
		search_button.style.display = "inline-block";

		let filter_control = this.createFilterCombo();
		filter_control.style.display = "inline-block";

		let cell = $el('td', {width:'100%'}, [filter_control, this.search_box, '  ', search_button]);
		let search_control = $el('table', {width:'100%'},
				[
					$el('tr', {}, [cell])
				]
			);

		cell.style.textAlign = "right";
		this.element.appendChild(search_control);
	}

	async createBottomControls() {
		var close_button = document.createElement("button");
		close_button.className = "cm-small-button";
		close_button.innerHTML = "Close";
		close_button.onclick = () => { this.close(); }
		close_button.style.display = "inline-block";

		this.message_box = $el('div', {id:'custom-download-message'}, [$el('br'), '']);
		this.message_box.style.height = '60px';
		this.message_box.style.verticalAlign = 'middle';

		this.element.appendChild(this.message_box);
		this.element.appendChild(close_button);
	}

	async show() {
		try {
			this.invalidateControl();
			this.element.style.display = "block";
			this.element.style.zIndex = 10001;
		}
		catch(exception) {
			app.ui.dialog.show(`Failed to get external model list. / ${exception}`);
		}
	}
}
