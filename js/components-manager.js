import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"
import { GroupNodeConfig, GroupNodeHandler } from "../../extensions/core/groupNode.js";
import { ComfyDialog, $el } from "../../scripts/ui.js";
import { isInstalled } from "./component-builder.js";

export class ComponentsManager extends ComfyDialog {
	static instance = null;

	clear() {

	}

	constructor(app, manager_dialog) {
		super();
		this.manager_dialog = manager_dialog;
		this.search_keyword = '';
		this.element = $el("div.comfy-modal", { parent: document.body }, []);
		this.install_buttons = [];
	}

	apply_searchbox(data) {
		let keyword = this.search_box.value.toLowerCase();
		for(let i in this.grid_rows) {
			let data = this.grid_rows[i].data;
			let content = data.author.toLowerCase() + data.packname.toLowerCase() + data.category.toLowerCase();

			if(this.filter && this.filter != '*') {
				if(this.filter == 'Installed') {
					this.grid_rows[i].control.style.display = null;
				}
				else {
					this.grid_rows[i].control.style.display = 'none';
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

	getNodes() {
		let groupNodes = app.graph.extra?.groupNodes;
		let res = [];

		if(groupNodes) {
			for(let name in groupNodes) {
				let item = groupNodes[name];

				let state = "Installed";
				if(!isInstalled(name)) {
					if(item.prefix)
						state = "NotInstalled";
					else {
//						state = "NotComponent";
						continue;
					}
				}

				let data =
					{
						"version": item.version,
						"packname": item.packname,
						"author": item.author,
						"name": name,
						"category": item.category,
						"node": item,
						"state": state
					};

				if(!data.author)
					data.author = '';

				res.push(data);
			}
		}

		return res;
	}

	invalidate_check(self, checked, installed) {

	}

	async invalidateControl() {
		this.clear();

		// invalidate
		this.data = this.getNodes();

		while (this.element.children.length) {
			this.element.removeChild(this.element.children[0]);
		}

		this.createHeaderControls();
		await this.createGrid();
		this.apply_searchbox(this.data);
		this.createBottomControls();
	}

	void uninstall_components(name) {

	}

	void install_components(data) {
		save_as_component(data.node, )
	}

	async createGrid() {
		var grid = document.createElement('table');
		grid.setAttribute('id', 'components-grid');

		this.grid_rows = {};

		let self = this;

		var thead = document.createElement('thead');
		var tbody = document.createElement('tbody');

		var headerRow = document.createElement('tr');
		thead.style.position = "sticky";
		thead.style.top = "0px";
		thead.style.width = "100%";
		thead.style.borderCollapse = "collapse";

		var header0 = document.createElement('th');
		header0.style.width = "20px";
		this.checkbox_all = $el("input",{type:'checkbox', id:'check_all'},[]);
		header0.appendChild(this.checkbox_all);
		this.checkbox_all.checked = false;
		this.checkbox_all.disabled = true;
		this.checkbox_all.addEventListener('change', function() { self.check_all.call(self, self.checkbox_all.checked); });

		var header1 = document.createElement('th');
		header1.innerHTML = '&nbsp;&nbsp;ID&nbsp;&nbsp;';
		header1.style.width = "20px";
		var header2 = document.createElement('th');
		header2.innerHTML = 'Packname';
		header2.style.width = "150px";
		var header3 = document.createElement('th');
		header3.innerHTML = 'Author';
		header3.style.width = "150px";
		var header4 = document.createElement('th');
		header4.innerHTML = 'Name';
		header4.style.width = "calc(100% - 450px)";
		var header5 = document.createElement('th');
		header5.innerHTML = 'Action';
		header5.style.width = "130px";
		header4.style.maxWidth = "500px";

		header0.style.position = "sticky";
		header0.style.top = "0px";
		header1.style.position = "sticky";
		header1.style.top = "0px";
		header2.style.position = "sticky";
		header2.style.top = "0px";
		header3.style.position = "sticky";
		header3.style.top = "0px";
		header4.style.position = "sticky";
		header4.style.top = "0px";
		header5.style.position = "sticky";
		header5.style.top = "0px";

		thead.appendChild(headerRow);
		headerRow.appendChild(header0);
		headerRow.appendChild(header1);
		headerRow.appendChild(header2);
		headerRow.appendChild(header3);
		headerRow.appendChild(header4);
		headerRow.appendChild(header5);

		headerRow.style.backgroundColor = "Black";
		headerRow.style.color = "White";
		headerRow.style.textAlign = "center";
		headerRow.style.width = "100%";
		headerRow.style.padding = "0";

		grid.appendChild(thead);
		grid.appendChild(tbody);

		if(this.data)
			for (var i = 0; i < this.data.length; i++) {
				const data = this.data[i];
				let dataRow = document.createElement('tr');
				dataRow.style.lineHeight = '50px';

				let data0 = document.createElement('td');
				let checkbox = $el("input",{type:'checkbox', id:`check_${i}`},[]);
				data0.appendChild(checkbox);
				checkbox.checked = false;
				checkbox.addEventListener('change', function() { self.invalidate_checks.call(self, checkbox.checked, data.state); });

				var data1 = document.createElement('td');
				data1.style.textAlign = "center";
				data1.innerHTML = i+1;

				var data2 = document.createElement('td');
				data2.style.maxWidth = "150px";
				data2.className = "cm-component-packname"
				data2.textContent = `${data.packname}`;
				data2.style.whiteSpace = "nowrap";
				data2.style.overflow = "hidden";
				data2.style.textOverflow = "ellipsis";

				var data3 = document.createElement('td');
				data3.style.maxWidth = "150px";
				data3.style.wordWrap = "break-word";
				data3.className = "cm-component-author"
				data3.textContent = `${data.packname}`;

				var data4 = document.createElement('td');
				data4.style.wordWrap = "break-word";
				data4.className = "cm-component-name"
				data4.textContent = `${data.name}`;
				data4.style.width = "calc(100% - 450px)";

				var data5 = document.createElement('td');
				data5.style.maxWidth = "130px";
				data5.style.textAlign = "center";
				data5.style.wordWrap = "break-word";
				data5.className = "cm-component-action";

				var installBtn = document.createElement('button');
				installBtn.className = "cm-btn-install";
				var installBtn2 = null;
				var installBtn3 = null;
				var installBtn4 = null;

				this.install_buttons.push(installBtn);

				switch(data.state) {
				case 'HasUpdate':
					installBtn2 = document.createElement('button');
					installBtn2.innerHTML = 'Update';
					installBtn2.className = "cm-btn-update";
					installBtn2.style.backgroundColor = 'blue';
					installBtn2.style.color = 'white';
					this.install_buttons.push(installBtn2);

					installBtn.innerHTML = 'Uninstall';
					installBtn.style.backgroundColor = 'red';
					data5.appendChild(installBtn);
					break;

				case 'Installed':
					installBtn.innerHTML = 'Uninstall';
					installBtn.style.backgroundColor = 'red';
					data5.appendChild(installBtn);
					break;

				case 'NotInstalled':
					installBtn.innerHTML = 'Install';
					installBtn.style.backgroundColor = 'black';
					installBtn.style.color = 'white';
					data5.appendChild(installBtn);
					break;

				case 'NotComponent':
					break;

				default:
					break;
				}

				let j = i;
				if(installBtn2 != null) {
					installBtn2.style.width = "120px";
					installBtn2.addEventListener('click', function() {
						// todo
					});

					data5.appendChild(installBtn2);
				}

				installBtn.style.width = "120px";
				installBtn.addEventListener('click', function() {
					if(this.innerHTML == 'Uninstall') {
						this.uninstall_components(data.name);
					}
					else {
						this.install_components(data.name);
					}
				});

				if(data.state == 'Fail')
					dataRow.style.backgroundColor = "#880000";
				else
					dataRow.style.backgroundColor = "var(--bg-color)";
				dataRow.style.color = "var(--fg-color)";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data0);
				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				tbody.appendChild(dataRow);

				let buttons = [];
				if(installBtn) {
					buttons.push(installBtn);
				}
				if(installBtn2) {
					buttons.push(installBtn2);
				}

				this.grid_rows[i] = {data:data, buttons:buttons, checkbox:checkbox, control:dataRow};
			}

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
		grid.style.tableLayout = "fixed";
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
				{ value:'Installed', text:'Filter: installed' },
				{ value:'NotInstalled', text:'Filter: not installed' },
				{ value:'NotComponent', text:'Filter: not component' },
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

		if(self.filter) {
			combo.value = self.filter;
		}

		return combo;
	}

	createHeaderControls() {
		let self = this;
		this.search_box = $el('input.cm-search-filter', {type:'text', id:'manager-components-search-box', placeholder:'input search keyword', value:this.search_keyword}, []);
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

		this.message_box = $el('div', {id:'components-installer-message'}, [$el('br'), '']);
		this.message_box.style.height = '60px';
		this.message_box.style.verticalAlign = 'middle';

		this.element.appendChild(this.message_box);
		this.element.appendChild(close_button);
	}

	async show(show_mode) {
		try {
			this.invalidateControl();

			this.element.style.display = "block";
			this.element.style.zIndex = 10001;
		}
		catch(exception) {
			app.ui.dialog.show(`Failed to get component list. / ${exception}`);
		}
	}
}